import type { TransitRoute, TransitStop } from "./transit";
import { nextDeparture } from "./transit-schedule";
import type { RouteSegment } from "./route-segment";

const WALK_SPEED_MPS = 1.35; // ~4.9 كم/س
const BUS_SPEED_MPS = 6.5; // ~23 كم/س (متوسط يشمل الوقوف)
const MAX_WALK_METERS = 1200; // أقصى مسافة مشي معقولة إلى/من محطة
const FALLBACK_NEAREST_STOPS = 3; // إن لم توجد محطة ضمن المسافة المعقولة
const DEFAULT_TRANSFER_WAIT_SECONDS = 6 * 60; // تقدير انتظار افتراضي لخط بلا جدول

export type LngLatPoint = [number, number];

export type TransitLeg =
  | {
      mode: "walk";
      from: LngLatPoint;
      to: LngLatPoint;
      distanceMeters: number;
      durationSeconds: number;
    }
  | {
      mode: "bus";
      routeId: string;
      routeName: string;
      color: string;
      boardStopId: string;
      boardStopName: string;
      alightStopId: string;
      alightStopName: string;
      numStops: number;
      distanceMeters: number;
      durationSeconds: number;
      waitSeconds: number;
      departureLabel: string | null;
      coordinates: LngLatPoint[];
    };

export type TransitItinerary = {
  legs: TransitLeg[];
  totalDistanceMeters: number;
  /** المجموع الكلي بالثواني، يشمل وقت الانتظار المُقدَّر عند الركوب. */
  totalDurationSeconds: number;
};

function haversine(a: LngLatPoint, b: LngLatPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestCandidates(
  point: LngLatPoint,
  stops: TransitStop[],
): { stopId: string; distance: number }[] {
  const all = stops
    .map((s) => ({ stopId: s.id, distance: haversine(point, [s.lng, s.lat]) }))
    .sort((a, b) => a.distance - b.distance);
  const within = all.filter((c) => c.distance <= MAX_WALK_METERS);
  return within.length > 0 ? within : all.slice(0, FALLBACK_NEAREST_STOPS);
}

type BusEdge = { to: string; routeId: string; distance: number };

/** يبني قائمة تجاور: معرّف محطة → حواف باص صادرة منها (باتجاهين على طول كل خط). */
function buildAdjacency(
  routes: TransitRoute[],
  stopById: Map<string, TransitStop>,
): Map<string, BusEdge[]> {
  const adjacency = new Map<string, BusEdge[]>();
  const push = (from: string, edge: BusEdge) => {
    const list = adjacency.get(from) ?? [];
    list.push(edge);
    adjacency.set(from, list);
  };
  for (const route of routes) {
    const ids = route.stopIds.filter((id) => stopById.has(id));
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i];
      const b = ids[i + 1];
      const sa = stopById.get(a)!;
      const sb = stopById.get(b)!;
      const distance = haversine([sa.lng, sa.lat], [sb.lng, sb.lat]);
      push(a, { to: b, routeId: route.id, distance });
      push(b, { to: a, routeId: route.id, distance });
    }
  }
  return adjacency;
}

/** أقرب فهرس نقطة في مسار الخط لإحداثية محطة — لاقتطاع الرسم البصري لجزء الرحلة. */
function nearestPathIndex(path: LngLatPoint[], point: LngLatPoint): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = haversine(path[i], point);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function sliceRoutePath(
  route: TransitRoute,
  boardStop: TransitStop,
  alightStop: TransitStop,
): LngLatPoint[] {
  if (route.path.length < 2) {
    return [
      [boardStop.lng, boardStop.lat],
      [alightStop.lng, alightStop.lat],
    ];
  }
  const boardIdx = nearestPathIndex(route.path, [boardStop.lng, boardStop.lat]);
  const alightIdx = nearestPathIndex(route.path, [alightStop.lng, alightStop.lat]);
  const [lo, hi] = boardIdx <= alightIdx ? [boardIdx, alightIdx] : [alightIdx, boardIdx];
  const slice = route.path.slice(lo, hi + 1) as LngLatPoint[];
  if (slice.length < 2) {
    return [
      [boardStop.lng, boardStop.lat],
      [alightStop.lng, alightStop.lat],
    ];
  }
  return boardIdx <= alightIdx ? slice : [...slice].reverse();
}

const ORIGIN = "__origin__";
const DEST = "__dest__";

type StateKey = string; // `${node}|${lastRouteId ?? "-"}`
function key(node: string, lastRouteId: string | null): StateKey {
  return `${node}|${lastRouteId ?? "-"}`;
}

type PrevInfo = {
  prevKey: StateKey;
  node: string;
  lastRouteId: string | null;
  // معلومات الحافة المستخدمة للوصول لهذه الحالة
  edgeKind: "walk-start" | "walk-end" | "bus";
  routeId?: string;
  waitSeconds?: number;
  travelSeconds: number;
  distanceMeters: number;
};

/**
 * يخطط رحلة مشي↔باص↔مشي من origin إلى destination باستخدام بيانات خطوط
 * ومحطات النقل المُدارة في لوحة الأدمن. يعيد null إن تعذّر إيجاد أي محطات
 * قريبة بما يكفي (عندها يجب على الواجهة اقتراح المشي المباشر بدلًا من ذلك).
 */
export function planTransitTrip(
  origin: LngLatPoint,
  destination: LngLatPoint,
  routes: TransitRoute[],
  stops: TransitStop[],
): TransitItinerary | null {
  if (stops.length === 0 || routes.length === 0) return null;

  const stopById = new Map(stops.map((s) => [s.id, s]));
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const adjacency = buildAdjacency(routes, stopById);

  const originCandidates = nearestCandidates(origin, stops);
  const destCandidates = nearestCandidates(destination, stops);
  const destByStop = new Map(destCandidates.map((c) => [c.stopId, c.distance]));

  const dist = new Map<StateKey, number>(); // ثواني منذ الآن
  const prev = new Map<StateKey, PrevInfo>();
  const visited = new Set<StateKey>();

  const startKey = key(ORIGIN, null);
  dist.set(startKey, 0);

  function relax(fromKey: StateKey, toKey: StateKey, elapsed: number, info: PrevInfo) {
    const current = dist.get(toKey);
    if (current === undefined || elapsed < current) {
      dist.set(toKey, elapsed);
      prev.set(toKey, info);
    }
  }

  // نقطة الانطلاق: مشي من ORIGIN لكل محطة مرشّحة قريبة
  for (const c of originCandidates) {
    const seconds = c.distance / WALK_SPEED_MPS;
    relax(startKey, key(c.stopId, null), seconds, {
      prevKey: startKey,
      node: c.stopId,
      lastRouteId: null,
      edgeKind: "walk-start",
      travelSeconds: seconds,
      distanceMeters: c.distance,
    });
  }

  // Dijkstra بسيط (مسح خطي لاختيار الأقل) — مناسب لحجم شبكة خطوط مدينة واحدة
  while (true) {
    let bestKey: StateKey | null = null;
    let bestDist = Infinity;
    for (const [k, d] of dist) {
      if (visited.has(k)) continue;
      if (d < bestDist) {
        bestDist = d;
        bestKey = k;
      }
    }
    if (bestKey === null) break;
    visited.add(bestKey);
    const [node, lastRouteRaw] = bestKey.split("|");
    const lastRouteId = lastRouteRaw === "-" ? null : lastRouteRaw;
    if (node === DEST) break;

    // محطة → الوجهة مشيًا
    const distToDest = destByStop.get(node);
    if (distToDest !== undefined) {
      const seconds = distToDest / WALK_SPEED_MPS;
      relax(bestKey, key(DEST, null), bestDist + seconds, {
        prevKey: bestKey,
        node: DEST,
        lastRouteId: null,
        edgeKind: "walk-end",
        travelSeconds: seconds,
        distanceMeters: distToDest,
      });
    }

    // محطة → محطات مجاورة عبر خطوط الباص
    for (const edge of adjacency.get(node) ?? []) {
      const travelSeconds = edge.distance / BUS_SPEED_MPS;
      let waitSeconds = 0;
      if (edge.routeId !== lastRouteId) {
        const route = routeById.get(edge.routeId);
        const dep = route ? nextDeparture(route, new Date(Date.now() + bestDist * 1000)) : null;
        waitSeconds = dep ? dep.waitMinutes * 60 : DEFAULT_TRANSFER_WAIT_SECONDS;
      }
      const elapsed = bestDist + waitSeconds + travelSeconds;
      relax(bestKey, key(edge.to, edge.routeId), elapsed, {
        prevKey: bestKey,
        node: edge.to,
        lastRouteId: edge.routeId,
        edgeKind: "bus",
        routeId: edge.routeId,
        waitSeconds,
        travelSeconds,
        distanceMeters: edge.distance,
      });
    }
  }

  const destKey = key(DEST, null);
  if (!dist.has(destKey)) return null;

  // إعادة بناء المسار من DEST رجوعًا إلى ORIGIN
  const chain: PrevInfo[] = [];
  let cursor: StateKey | undefined = destKey;
  while (cursor && cursor !== startKey) {
    const info = prev.get(cursor);
    if (!info) break;
    chain.unshift(info);
    cursor = info.prevKey;
  }

  // دمج حلقات الباص المتتالية على نفس الخط في مرحلة واحدة
  const legs: TransitLeg[] = [];
  let i = 0;
  let cursorNode: string = ORIGIN;
  while (i < chain.length) {
    const step = chain[i];
    if (step.edgeKind === "walk-start" || step.edgeKind === "walk-end") {
      const fromPoint: LngLatPoint =
        cursorNode === ORIGIN ? origin : [stopById.get(cursorNode)!.lng, stopById.get(cursorNode)!.lat];
      const toPoint: LngLatPoint =
        step.node === DEST ? destination : [stopById.get(step.node)!.lng, stopById.get(step.node)!.lat];
      legs.push({
        mode: "walk",
        from: fromPoint,
        to: toPoint,
        distanceMeters: step.distanceMeters,
        durationSeconds: step.travelSeconds,
      });
      cursorNode = step.node;
      i++;
      continue;
    }

    // مرحلة باص: اجمع كل الخطوات المتتالية بنفس routeId
    const routeId = step.routeId!;
    const boardStopId = cursorNode;
    let j = i;
    let distanceMeters = 0;
    let travelSeconds = 0;
    const waitSeconds = step.waitSeconds ?? 0;
    let stopsCount = 0;
    while (j < chain.length && chain[j].edgeKind === "bus" && chain[j].routeId === routeId) {
      distanceMeters += chain[j].distanceMeters;
      travelSeconds += chain[j].travelSeconds;
      stopsCount++;
      j++;
    }
    const alightStopId = chain[j - 1].node;
    const route = routeById.get(routeId);
    const boardStop = stopById.get(boardStopId);
    const alightStop = stopById.get(alightStopId);
    if (route && boardStop && alightStop) {
      // زمن الوصول إلى محطة الركوب (قبل احتساب هذه المرحلة) — لتقدير الرحلة القادمة بالتوقيت الفعلي
      const arrivalElapsed =
        i > 0 ? (dist.get(key(chain[i - 1].node, chain[i - 1].lastRouteId)) ?? 0) : 0;
      const dep = nextDeparture(route, new Date(Date.now() + arrivalElapsed * 1000));
      legs.push({
        mode: "bus",
        routeId,
        routeName: route.name,
        color: route.color,
        boardStopId,
        boardStopName: boardStop.name,
        alightStopId,
        alightStopName: alightStop.name,
        numStops: stopsCount,
        distanceMeters,
        durationSeconds: waitSeconds + travelSeconds,
        waitSeconds,
        departureLabel: dep?.label ?? null,
        coordinates: sliceRoutePath(route, boardStop, alightStop),
      });
    }
    cursorNode = alightStopId;
    i = j;
  }

  if (legs.length === 0) return null;

  const totalDistanceMeters = legs.reduce((s, l) => s + l.distanceMeters, 0);
  const totalDurationSeconds = legs.reduce((s, l) => s + l.durationSeconds, 0);
  return { legs, totalDistanceMeters, totalDurationSeconds };
}

/** يحوّل مخطّط رحلة الباص إلى أجزاء مسار جاهزة للرسم على الخريطة. */
export function itineraryToSegments(itinerary: TransitItinerary): RouteSegment[] {
  return itinerary.legs.map((leg) =>
    leg.mode === "walk"
      ? { mode: "walk", coordinates: [leg.from, leg.to] }
      : { mode: "bus", coordinates: leg.coordinates, color: leg.color },
  );
}
