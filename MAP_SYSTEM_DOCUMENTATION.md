# 📘 Interactive Map (Hayyak in Medina) — Full Technical Documentation

> **نظام خريطة المدينة المنورة التفاعلية (Hayyak Interactive Map)**
>
> A lightweight, fast, and edge-ready interactive map portal built for exploring Medina. It features an interactive map with customized categorized markers, a dynamic client-side filtering system, routing and search capabilities without relying on paid APIs, and an admin panel to manage places dynamically.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture & Folder Structure](#3-architecture--folder-structure)
4. [Database Schema (SQLite / libSQL)](#4-database-schema-sqlite--libsql)
   - 4.1 [Places](#41-places)
   - 4.2 [Bookings (Reservations)](#42-bookings-reservations)
   - 4.3 [Transit (Bus Routes & Stops)](#43-transit-bus-routes--stops)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Core Modules](#6-core-modules)
   - 6.1 [Interactive Map & Clustering](#61-interactive-map--clustering)
   - 6.2 [Admin Dashboard (Places Management)](#62-admin-dashboard-places-management)
   - 6.3 [Search & Routing Integration](#63-search--routing-integration)
   - 6.4 [File Storage (Cloudflare R2)](#64-file-storage-cloudflare-r2)
   - 6.5 [Bookings (Reservations)](#65-bookings-reservations)
   - 6.6 [Transit / Bus Lines Management](#66-transit--bus-lines-management)
     - 6.6.1 [Bus Trip Planner (walk → ride → walk)](#661-bus-trip-planner-walk--ride--walk)
   - 6.7 [Google Maps Link Resolver](#67-google-maps-link-resolver)
7. [API Routes](#7-api-routes)
8. [Deployment & Scaling](#8-deployment--scaling)
9. [Real-World Scenarios](#9-real-world-scenarios) (incl. [Scenario 7: Planning a Trip by Bus](#scenario-7-a-visitor-plans-a-trip-by-bus))

---

## 1. System Overview

The Interactive Map system provides a comprehensive visual guide to Medina. It is completely free from commercial API keys (like Google Maps), using open-source tools and self-hosted infrastructure components wherever possible.

### What the system does:

| Capability | Description |
|---|---|
| **Map Rendering** | Fast vector-based map rendering with Arabic label support. |
| **Clustering** | Automatic grouping of markers (clustering) to handle thousands of places without lag. |
| **Category Filtering** | Filter places by categories (Mosques, Landmarks, Transport, Commercial). |
| **Geocoding (Search)** | Arabic autocomplete search for locations using Nominatim. |
| **Routing & Directions** | Calculates paths, distances, and ETAs from the user's location (or the Prophet's Mosque) using OSRM. |
| **Admin Panel** | Protected dashboard to perform CRUD operations on map locations. |
| **Image Uploads** | Directly upload place images to Cloudflare R2 object storage. |
| **Reservations (Booking)** | Public users can reserve a "bookable" place (e.g. a restaurant table) and receive a reference code + QR code. |
| **Bookings Admin** | Dashboard listing all reservations made across bookable places. |
| **Transit / Bus Lines** | Admin-managed bus routes and stops rendered as colored lines + stop markers on the map, with an optional schedule (frequency or fixed departure times) per route. |
| **Multi-Modal Directions** | Google-Maps-style travel mode switcher (driving / walking / bus) in the directions panel — driving and walking compute real routes via two different OSRM profiles; bus mode plans a walk→ride→walk itinerary across the admin-managed transit network. |
| **Google Maps Link Resolver** | Admin can paste a Google Maps link (including shortened `maps.app.goo.gl` links) to auto-extract coordinates instead of manually dropping a pin — usable for both places and transit stops. |

### Two User Roles

| Role | Login Page | Access |
|---|---|---|
| **Public User** | `/` | Explore the map, search places, get directions, switch categories. |
| **Admin** | `/admin` | Logs in via simple password. Can add, edit, and delete markers on the map. |

---

## 2. Technology Stack

### Core Framework

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.2.9 | App Router, Server APIs, and Edge-ready React architecture. |
| **React** | 19.2.4 | UI library (Client Components for the map, Server Components for layouts). |
| **TypeScript** | 5.x | Type-safe codebase throughout. |

### Map & Geo-Services

| Library / Service | Purpose |
|---|---|
| **MapLibre GL JS** | Open-source alternative to Mapbox GL JS for fast WebGL vector maps. |
| **OpenFreeMap** | Provides free, unmetered map tiles (`styles/liberty`). |
| **mapbox-gl-rtl-text**| Processes Arabic text to display correctly (RTL + shaping) on the map canvas. |
| **OSRM (Open Source Routing Machine)** | Calculates driving/walking directions and ETAs (via `/api/directions?profile=driving\|walking`) — driving uses the public `router.project-osrm.org` demo (its profile in the URL is actually ignored, always "driving"); walking uses the FOSSGIS public instance (`routing.openstreetmap.de/routed-foot`), which has a real distinct foot profile. |
| **Nominatim (OpenStreetMap)** | Handles Arabic search and geocoding (via `/api/search`). |

### Database & Storage

| Library / Service | Purpose |
|---|---|
| **SQLite (libSQL)** | Lightweight DB. Runs locally via file (`local.db`) or connects to Turso in production. |
| **@libsql/client** | Client for querying the database. |
| **Cloudflare R2** | S3-compatible storage for storing place images. |
| **aws4fetch** | Handles AWS SigV4 signing to talk to Cloudflare R2 over raw HTTP. |

### Bookings & Extras

| Library | Purpose |
|---|---|
| **qrcode** | Renders a QR code for each booking's reference code entirely client-side (no network request, canvas-based). |

### UI & Styling

| Library | Version | Purpose |
|---|---|---|
| **TailwindCSS** | 4.x | Utility-first styling framework. |
| **@fontsource-variable/cairo** | Self-hosted Arabic font for UI. |
| **react-icons** | SVG icons for the UI and admin dashboard. |

---

## 3. Architecture & Folder Structure

```
interactive_map/
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Global layout (RTL, Cairo font setup)
│   │   ├── page.tsx               # Main map interface (Client side rendering)
│   │   ├── admin/                 # Admin Dashboard
│   │   │   ├── login/page.tsx     # Admin login form
│   │   │   └── page.tsx           # Protected admin dashboard
│   │   └── api/                   # Serverless API routes
│   │       ├── admin/             # Login/Logout session handlers
│   │       ├── directions/        # Proxy to OSRM routing engine
│   │       ├── places/            # CRUD endpoints for map places
│   │       ├── search/            # Proxy to Nominatim search engine
│   │       ├── upload/            # Proxy for uploading images to R2
│   │       ├── bookings/          # Create/list reservations for bookable places
│   │       ├── transit/           # CRUD for bus routes & stops (routes/, stops/)
│   │       └── resolve-map-link/  # Admin-only Google Maps link → coordinates resolver
│   │
│   ├── components/
│   │   ├── MapApp.tsx             # Central state manager and UI overlay for the map
│   │   ├── MapView.tsx            # The core MapLibre wrapper component (Dynamic, SSR disabled)
│   │   ├── AdminDashboard.tsx     # React component for managing places
│   │   ├── LocationPicker.tsx     # Draggable pin to select coordinates in admin
│   │   ├── BookingSheet.tsx       # Public-facing reservation form (bottom sheet)
│   │   ├── BookingQR.tsx          # Client-side QR code renderer (canvas, `qrcode` lib)
│   │   ├── BookingsAdmin.tsx      # Admin table listing all reservations
│   │   ├── TransitAdmin.tsx       # Admin CRUD UI for bus routes & stops (incl. schedule fields)
│   │   └── RoutePicker.tsx        # Map-based picker for drawing/ordering a transit route's stops
│   │
│   └── lib/
│       ├── auth.ts                # Session management using HMAC cookies
│       ├── db.ts                  # libSQL database client setup & auto-migration
│       ├── mapStyle.ts            # MapLibre style config and RTL text injection
│       ├── places-repo.ts         # DB queries (CRUD) for places (incl. bookable/price/bookingUrl)
│       ├── places.ts              # Category definitions and initial seed data
│       ├── bookings-repo.ts       # DB queries for reservations + reference-code generation
│       ├── transit-repo.ts        # DB queries for bus routes/stops (incl. schedule + ordered stopIds)
│       ├── transit-schedule.ts    # Next-departure calculation from frequency or fixed times
│       ├── transit-routing.ts     # Client-side walk→bus→walk trip planner (graph + time-aware Dijkstra)
│       ├── route-segment.ts       # Shared type for a drawn route segment (drive/walk/bus)
│       ├── google-maps-link.ts    # Regex-based coordinate extraction from Google Maps URLs
│       └── r2.ts                  # Upload functions targeting Cloudflare R2
│
├── public/
│   └── mapbox-gl-rtl-text.js      # Local copy of RTL text plugin to prevent external fetching
├── local.db                       # Auto-generated SQLite database (in dev)
└── .env.local                     # Secrets (Auth, DB url, R2 config)
```

### Architectural Pattern

- **Client-Heavy Map:** The map requires browser APIs (WebGL), so `MapView.tsx` is strictly a client component. Next.js SSR is disabled for the map to prevent hydration mismatches.
- **Proxy APIs:** The Next.js API routes (`/api/search`, `/api/directions`) act as proxies. This hides the external IP, avoids CORS issues with public APIs, and allows caching or swapping the provider later without touching the frontend.
- **Serverless-Ready DB:** `db.ts` dynamically chooses the native SQLite driver if `DATABASE_URL` is a local file, or switches to the web HTTP driver (`@libsql/client/web`) if targeting a Turso remote DB.

---

## 4. Database Schema (SQLite / libSQL)

The database is managed by `src/lib/db.ts` and now spans four tables (`places` plus the bookings and transit additions below). All schema changes are auto-migrated on startup — no manual migration step is required.

### 4.1 Places

```sql
CREATE TABLE IF NOT EXISTS places (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_en     TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL,       -- e.g., 'mosque', 'landmark', 'transport', 'commercial'
  lng         REAL NOT NULL,
  lat         REAL NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  bookable    INTEGER NOT NULL DEFAULT 0,  -- 0/1 — can this place be reserved?
  price       REAL NOT NULL DEFAULT 0,     -- Reservation price (SAR) — optional, 0 = unset
  booking_url TEXT NOT NULL DEFAULT '',    -- optional external booking link (independent of `bookable`)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
)
```

**Features:**
- Uses UUIDs as primary keys.
- **Seeding:** If the table is empty upon initialization, it automatically seeds predefined landmark data from `src/lib/places.ts`.
- **Self-migrating:** `src/lib/db.ts` checks `PRAGMA table_info(places)` on every init and `ALTER TABLE`-adds any missing column (`image_url`, `bookable`, `price`, `booking_url`) — so existing local/production databases upgrade automatically without a manual migration step.
- **Price is optional:** `price` defaults to `0`, which the UI treats as "unset" — a bookable place's popup only shows a price if one was entered, and `booking_url` (an external reservation link, e.g. a restaurant's own site) can be set independently of the internal `bookable` flow, with both shown together when applicable.

### 4.2 Bookings (Reservations)

```sql
CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  place_id       TEXT NOT NULL,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  party_size     INTEGER NOT NULL DEFAULT 1,
  price          REAL NOT NULL DEFAULT 0,   -- Snapshot of the place's price at booking time
  reference_code TEXT NOT NULL,             -- 8-char uppercase code shown as text + QR
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
)
```

A booking can only be created for a place where `bookable = 1` (enforced server-side in `bookings-repo.ts`, returns `not_bookable` otherwise). There is no user account system — anyone can submit a reservation with name + phone.

### 4.3 Transit (Bus Routes & Stops)

```sql
CREATE TABLE IF NOT EXISTS transit_routes (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  name_en           TEXT NOT NULL DEFAULT '',
  color             TEXT NOT NULL DEFAULT '#2563eb',  -- Line color drawn on the map
  description       TEXT NOT NULL DEFAULT '',
  path              TEXT NOT NULL,                    -- GeoJSON LineString geometry (JSON string)
  schedule_start    TEXT NOT NULL DEFAULT '',         -- "HH:MM" — operating window start (optional)
  schedule_end      TEXT NOT NULL DEFAULT '',         -- "HH:MM" — operating window end (optional)
  frequency_minutes INTEGER NOT NULL DEFAULT 0,       -- headway in minutes (0 = unused)
  fixed_times       TEXT NOT NULL DEFAULT '[]',       -- JSON array of "HH:MM" departures (optional)
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
)

CREATE TABLE IF NOT EXISTS transit_stops (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_en     TEXT NOT NULL DEFAULT '',
  lng         REAL NOT NULL,
  lat         REAL NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
)

CREATE TABLE IF NOT EXISTS transit_route_stops (
  route_id  TEXT NOT NULL,
  stop_id   TEXT NOT NULL,
  seq       INTEGER NOT NULL,   -- Ordering of the stop along the route
  PRIMARY KEY (route_id, stop_id)
)
```

Routes are rendered on the map as a dedicated `transit-lines` GeoJSON source/layer (see `MapView.tsx`), independent from the clustered `places` source, with click handling to select a route and highlight it.

**Schedule (optional, per route):** an admin can fill in either a frequency (`frequency_minutes` + an optional `schedule_start`/`schedule_end` operating window) or a list of `fixed_times` — whichever matches how that line actually runs. `src/lib/transit-schedule.ts` computes the next departure from whichever is set (fixed times take priority over frequency), used both for the "next departure" hint shown on a route/stop's info card and as the boarding-wait estimate inside the trip planner below. A route with neither field filled in simply shows no schedule info.

---

## 5. Authentication & Authorization

The system avoids complex auth providers (like NextAuth/Auth.js) in favor of a fast, lightweight, dependency-free solution.

### Admin Login Flow
1. User enters the password at `/admin/login`.
2. `POST /api/admin/login` compares the password against `process.env.ADMIN_PASSWORD` using Node.js `timingSafeEqual`.
3. If valid, an HMAC signed token is generated (`sessionToken()`) using `process.env.AUTH_SECRET`.
4. Next.js sets a secure, HTTP-only cookie named `admin_session`.
5. The `isAdmin()` helper checks the cookie in subsequent API routes or layouts before granting access.

---

## 6. Core Modules

### 6.1 Interactive Map & Clustering
**File:** `src/components/MapView.tsx`
- **MapLibre GL:** Renders the map. Uses `OpenFreeMap` tiles for an unmetered, completely free base layer.
- **RTL Support:** Injects `mapbox-gl-rtl-text.js` upon initialization so Arabic labels render correctly connected and right-to-left.
- **Clustering:** Configures MapLibre's native source clustering (`cluster: true, clusterRadius: 50`). When zooming out, nearby markers group into numbered circles, ensuring the UI remains snappy even with thousands of places.

### 6.2 Admin Dashboard (Places Management)
**File:** `src/components/AdminDashboard.tsx`
- **Location Picker:** When adding a new place, the admin gets a mini-map (`LocationPicker.tsx`) to drag and drop a pin and easily grab exact coordinates.
- **Image Upload:** Admins can attach an image. The file is uploaded immediately via `/api/upload` to Cloudflare R2, returning a public URL which is saved to the database.

### 6.3 Search & Routing Integration
- **Search (Geocoding):** `/api/search` proxies requests to `nominatim.openstreetmap.org`. It appends `&countrycodes=sa` and biases results heavily toward Medina.
- **Routing:** `/api/directions?profile=driving|walking` proxies requests to a public OSRM server and returns route geometry, distance, and duration between two or more coordinates. `driving` uses `router.project-osrm.org` (note: this demo server ignores the profile segment in its URL and always serves its "driving" profile); `walking` is routed to the FOSSGIS public instance (`routing.openstreetmap.de/routed-foot`), which has a genuinely distinct pedestrian profile — verified to return different distances/paths than the driving profile for the same two points.
- **Multi-modal directions UI:** `MapApp.tsx` shows a Google-Maps-style travel mode switcher (driving / walking / bus) in the directions panel. Driving and walking call `/api/directions` with the matching `profile` and render the result as a single solid (drive) or dashed (walk) line. Selecting "bus" instead runs the client-side transit trip planner (§6.6) and restricts the directions panel to exactly two points (origin + destination), since a bus itinerary isn't meaningful across arbitrary multi-stop waypoints.

### 6.4 File Storage (Cloudflare R2)
**File:** `src/lib/r2.ts`
- Uses `aws4fetch` to manually sign AWS SigV4 requests.
- **Why `aws4fetch` instead of AWS SDK?** It is immensely lighter and purely relies on the native `fetch` API, making it perfectly suited for Edge environments (like Cloudflare Pages or Vercel Edge).
- **Next.js Fetch Workaround:** Next.js patches the global `fetch` which sometimes drops binary payloads (`ArrayBuffer`). The code bypasses this by invoking `_nextOriginalFetch` to guarantee file bytes reach R2 perfectly.

### 6.5 Bookings (Reservations)
**Files:** `src/components/BookingSheet.tsx`, `BookingQR.tsx`, `BookingsAdmin.tsx`, `src/lib/bookings-repo.ts`, `src/app/api/bookings/route.ts`

Any place can be flagged `bookable` (with a `price`) from the admin dashboard. On the public map, a bookable place's popup opens a **`BookingSheet`** bottom sheet instead of (or alongside) its info card:
1. Visitor fills name, phone, and party size — no account/login required.
2. `POST /api/bookings` validates the place exists and is actually `bookable` (rejecting otherwise with `not_bookable`), snapshots the current `price`, and generates an 8-character uppercase **reference code** (`randomUUID()` truncated).
3. The confirmation screen renders a **QR code client-side** via the `qrcode` package (`BookingQR.tsx`, canvas-based, zero network calls) encoding the reference code, alongside the plain-text code as a fallback.
4. Admins review all reservations in **`BookingsAdmin.tsx`** (`GET /api/bookings`, admin-only), joined against `places` for the place name.

This is explicitly a **demo/no-payment** flow — the UI copy states "حجز تجريبي بدون دفع فعلي" (a trial booking, no real payment).

### 6.6 Transit / Bus Lines Management
**Files:** `src/components/TransitAdmin.tsx`, `RoutePicker.tsx`, `src/lib/transit-repo.ts`, `src/app/api/transit/**`

A second data layer independent from `places`, letting the admin model public-transport lines:
- **Routes** (`transit_routes`) store a name, a display `color`, and a `path` (GeoJSON LineString) drawn on the map as a colored line.
- **Stops** (`transit_stops`) are point locations, optionally attached to one or more routes via `transit_route_stops` with a `seq` (stop order along the line).
- `RoutePicker.tsx` provides a map-based UI for drawing a route's path and ordering its stops.
- On the public map, `MapView.tsx` renders routes as a dedicated `transit-lines` GeoJSON source/layer with its own click handling (`transit-route-click` custom event) so clicking a line highlights it and can surface route info — kept entirely separate from the clustered `places` source/layer so the two data types never interfere with each other's rendering or clustering.
- **Adding stops via a Google Maps link:** in `RoutePicker.tsx`, "add stop" mode accepts either a click on the map or a pasted Google Maps link (reusing `google-maps-link.ts` and the same `/api/resolve-map-link` endpoint as the places form) — handy for copying a stop's exact location straight from a shared link instead of eyeballing it on the picker map.

#### 6.6.1 Bus Trip Planner (walk → ride → walk)
**File:** `src/lib/transit-routing.ts`

Since no free public transit-routing API exists for a custom city bus network, bus-mode directions are planned entirely client-side from the admin-managed routes/stops data already loaded on the public map:
1. **Graph construction:** each route's ordered `stopIds` become bidirectional edges between consecutive stops, weighted by the great-circle distance between them at an assumed average bus speed (~23 km/h, to account for stops/traffic).
2. **Connecting to the trip's endpoints:** the origin and destination each connect (by walking, ~4.9 km/h) to every stop within 1.2 km, falling back to the 3 nearest stops if none are that close.
3. **Time-aware shortest path:** a Dijkstra variant tracks `(stop, last-ridden-route)` as its state, so continuing on the same route costs nothing extra while switching routes (or boarding for the first time) adds a wait estimated from that route's schedule via `nextDeparture()` evaluated at the actual simulated arrival time — or a flat ~6-minute default if the route has no schedule configured.
4. **Itinerary reconstruction:** the winning path's consecutive same-route hops are merged into single "ride" legs (board stop → alight stop, stop count, distance, wait), interleaved with "walk" legs at the start/end. Each ride leg's on-map geometry is a slice of that route's actual drawn path (nearest-vertex-matched to the board/alight stops), not just a straight line.
5. **Rendering:** `itineraryToSegments()` turns the itinerary into `RouteSegment[]` — walk legs drawn as a dashed grey line, ride legs as a solid line in that route's own color — via the same generic `route` source/layers in `MapView.tsx` used by driving/walking. The directions panel lists each leg (walk distance/time, or route name + board/alight stop names + stop count + next-departure/wait) instead of a single distance/duration line.

If no stop is reachable near either endpoint (or no routes/stops exist at all), the planner returns `null` and the UI shows a status message rather than a broken route — driving or walking remain available as fallbacks.

### 6.7 Google Maps Link Resolver
**File:** `src/app/api/resolve-map-link/route.ts`, `src/lib/google-maps-link.ts`

Lets an admin paste a Google Maps URL when adding/editing a place instead of manually dragging a pin:
- `google-maps-link.ts` extracts `(lat, lng)` via regex from several known Google Maps URL shapes (`!3d..!4d..` pin data, `@lat,lng` camera center, `q=`/`ll=`/`center=` query params, `/place/lat,lng` paths, or bare pasted coordinates).
- **Shortened links** (`maps.app.goo.gl`, `goo.gl/maps`, `g.co/kgs`) can't be parsed directly since they require a redirect — `GET /api/resolve-map-link?url=...` follows the redirect server-side and re-parses the final URL (or, as a fallback, greps the response body for a `!3d..!4d..` pin).
- **Security:** the endpoint is admin-only and hard-restricts the target hostname to a small allowlist (`maps.app.goo.gl`, `goo.gl`, `g.co`, `maps.google.com`, `google.com`) before fetching, specifically to prevent it being abused as an open SSRF proxy for arbitrary URLs.

---

## 7. API Routes

| Route | Method | Access | Purpose |
|---|---|---|---|
| `/api/places` | GET | Public | Fetches all map places from SQLite. |
| `/api/places` | POST | Admin | Creates a new place. |
| `/api/places/[id]` | PATCH | Admin | Updates place details. |
| `/api/places/[id]` | DELETE | Admin | Removes a place. |
| `/api/search?q=...` | GET | Public | Proxies OSM Nominatim search. |
| `/api/directions?profile=driving\|walking` | GET | Public | Proxies OSRM to get a driving or walking route (bus itineraries are planned client-side, no API call). |
| `/api/upload` | POST | Admin | Uploads an image binary directly to R2. |
| `/api/admin/login` | POST | Public | Authenticates admin password. |
| `/api/admin/logout`| POST | Public | Destroys the admin session cookie. |
| `/api/bookings` | GET | Admin | Lists all reservations (joined with place name). |
| `/api/bookings` | POST | Public | Creates a reservation for a bookable place; returns a reference code. |
| `/api/transit/routes` | GET | Public | Lists all bus routes. |
| `/api/transit/routes` | POST | Admin | Creates a new bus route. |
| `/api/transit/routes/[id]` | PATCH/DELETE | Admin | Updates or deletes a route. |
| `/api/transit/routes/[id]/stops` | GET/POST | Public/Admin | Lists or attaches stops (with sequence) to a route. |
| `/api/transit/stops` | GET/POST | Public/Admin | Lists all stops / creates a new stop. |
| `/api/transit/stops/[id]` | PATCH/DELETE | Admin | Updates or deletes a stop. |
| `/api/resolve-map-link` | GET | Admin | Resolves a (possibly shortened) Google Maps URL into `{lat, lng}`. |

---

## 8. Deployment & Scaling

### Local Development
```bash
npm install
npm run dev
```
Automatically creates a `local.db` SQLite file.

### Production Environment (Vercel / Edge)
1. **Database:** Create a Turso libSQL database. Set `DATABASE_URL=libsql://...` and `DATABASE_AUTH_TOKEN=...`. The system will automatically switch to the HTTP-based web client.
2. **Storage:** Create a Cloudflare R2 bucket. Provide keys in `.env` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, etc.).
3. **Map APIs:** Since public OSRM and Nominatim have rate limits, for high-traffic production, it is highly recommended to self-host OSRM (Docker) and Nominatim or switch to a paid provider like Mapbox if SLA is required.

---

## 9. Real-World Scenarios

### Scenario 1: A User Gets Directions to a Mosque
1. User opens the site. The map centers on Medina.
2. The user taps a green "Mosque" pin on the map.
3. A popup shows the mosque name and image.
4. The user clicks "Directions".
5. The map prompts the browser for the user's GPS location.
6. Once permitted, a request goes to `/api/directions` with the user's `(lat, lng)` and the mosque's `(lat, lng)`.
7. OSRM returns the path. The map draws a solid blue line guiding the user and displays "Distance: 2.5 km, Time: 5 mins" at the bottom.

### Scenario 2: Admin Adds a New Restaurant
1. The admin visits `/admin` and logs in.
2. Clicks "Add Place". Selects category "Commercial" (تجاري).
3. Types "Al Baik Restaurant".
4. Clicks on the mini-map to drop a pin precisely on the restaurant's location.
5. Uploads a storefront picture. The file is streamed via `/api/upload` to R2, returning `https://...r2.../places/xyz.jpg`.
6. Submits the form. A `POST` to `/api/places` inserts the record into Turso/SQLite.
7. Next time any user loads the map, the new restaurant appears immediately.

### Scenario 3: Performance Under Load
If the database contains 10,000 locations in Medina:
- **Client-Side:** The browser does not render 10,000 DOM elements. MapLibre GL groups them into WebGL clusters. A user viewing the whole city sees bubbles with numbers (e.g., "500", "200"). As they zoom into a specific street, the bubbles explode into individual categorized icons, maintaining smooth 60fps performance.

### Scenario 4: Reserving a Table at a Bookable Restaurant
1. A visitor taps a restaurant marker flagged as bookable, priced at 50 SAR/person.
2. The `BookingSheet` bottom sheet opens. The visitor enters their name, phone, and a party size of 4.
3. `POST /api/bookings` verifies the place is bookable, snapshots the price, and returns reference code `A1B2C3D4`.
4. The confirmation screen shows a scannable QR code (generated fully client-side) plus the code as text — "keep this code or QR when you arrive."
5. Later, the admin opens `BookingsAdmin` and sees the new reservation listed with the visitor's name, phone, party size, and reference code.

### Scenario 5: Admin Publishes a New Bus Line
1. Admin opens the Transit tab in the admin dashboard and clicks "Add Route".
2. Names it "خط الحرم - المطار", picks a blue color, and uses `RoutePicker` to click along the road to draw the path and drop ordered stops.
3. Saves — `transit_routes` gets a new row with the path GeoJSON; each stop is inserted into `transit_stops` and linked via `transit_route_stops` with its sequence number.
4. Any visitor loading the public map now sees the new blue line rendered on the `transit-lines` layer; clicking it highlights the route and its stops.

### Scenario 6: Adding a Place via a Shared Google Maps Link
1. Admin receives a shortened Google Maps link (`https://maps.app.goo.gl/xyz123`) from a colleague pointing at a new landmark.
2. Instead of manually finding the spot on the map, the admin pastes the link into the "Add Place" form.
3. `GET /api/resolve-map-link` follows the redirect server-side (host-allowlisted to Google domains only), extracts the `!3d..!4d..` pin coordinates from the resolved URL, and returns `{lat, lng}`.
4. The form's coordinate fields auto-fill, and the admin just confirms the name/category/description.

### Scenario 7: A Visitor Plans a Trip by Bus
1. A visitor opens directions from Al-Masjid an-Nabawi to Quba Mosque and taps the "باص" (bus) icon in the travel-mode switcher.
2. The client-side trip planner (§6.6.1) finds the nearest stops to each point, and computes the fastest walk→ride→walk combination using the admin-managed routes.
3. The panel lists: "Walk 165m (2 min)" → "خط 1: الحرم - قباء — from محطة الحرم النبوي to محطة مسجد قباء · 3 stops · next at 07:15" → "Walk 57m (1 min)", with a "3.4 km · 17 min" total at the top.
4. The map draws the ride portion as a solid line in that route's own color (following its actual path between the two stops) and the walking portions as a dashed grey line, and highlights the used route(s) on the transit layer.
5. If no stop is close enough to either point, the visitor instead sees a message suggesting driving or walking directions.
