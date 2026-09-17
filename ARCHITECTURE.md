# Portfolio Website Architecture

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Build Tool** | Vite 6.3 |
| **Framework** | React 19 |
| **Routing** | React Router DOM 6.30 |
| **3D Graphics** | Three.js 0.176 + React Three Fiber 9 + Drei 10 |
| **Post-processing** | @react-three/postprocessing |

---

## Project Structure

```
src/
├── main.jsx          → App entry point (BrowserRouter wrapper)
├── App.jsx           → Main app with routes, color themes, color picker UI
├── pages/            → Route-based page components
│   ├── Home.jsx      → Landing page with portfolio cards
│   ├── About.jsx
│   ├── Projects.jsx
│   └── Contact.jsx
├── components/
│   ├── Header.jsx    → Site header
│   ├── Navigation.jsx → React Router Links navigation
│   ├── Footer.jsx
│   ├── 3d/           → Generic 3D scene components
│   │   ├── Scene.jsx → Canvas wrapper for 3D models
│   │   ├── Models.jsx
│   │   ├── ModelEditor.jsx
│   │   └── Controls.jsx
│   └── lavalamp/     → ⭐ Main visual feature
│       ├── MorphingLavaLamp.jsx → Complex metaball animation (~1600 lines)
│       ├── Scene.jsx
│       └── SceneControls.jsx
├── styles/
│   └── global.css    → Global styles + Inter font
└── utils/
    └── three-helpers.js
```

---

## Key Architectural Patterns

### 1. Client-Side Routing

- `main.jsx` wraps the app in `BrowserRouter`
- `App.jsx` defines routes: `/`, `/about`, `/projects`, `/contact`

### 2. Interactive 3D Lava Lamp (Hero Feature)

The centerpiece of this portfolio is an interactive lava lamp built with:

- **Marching cubes metaballs** algorithm for procedural mesh generation
- **Custom GLSL shaders** for lava lamp material effects:
  - Fresnel highlighting
  - Transparency/translucency
- **Physics simulation** constants for realistic fluid behavior:
  - `CONTAINER_HEIGHT`, `CONTAINER_RADIUS` for bounds
  - `ISOLATION`, `JIGGLE_INTENSITY` for blob behavior
  - Mouse interaction with repulsion effects

### 3. Theming System

- 30+ predefined color themes organized by category:
  - Sunset, Ocean, Forest, Neon, Pastel, Earth tones, Monochrome, Vibrant, Cool, Warm
- Each theme defines:
  - `base` color (main blob color)
  - `highlight` color (fresnel edge glow)
  - `background` color (scene background)
- `ColorPickerPortal` component renders via React Portal for user customization

### 4. Component Composition

- Pages compose reusable components + 3D scenes
- `Home.jsx` renders portfolio cards as interactive "blobs" in the lava lamp

---

## Data Flow

```
main.jsx (Router)
    └── App.jsx (Routes + Color State)
            ├── Navigation (Links)
            ├── Header
            ├── Routes → Pages (Home, About, Projects, Contact)
            │              └── MorphingLavaLamp (3D Canvas)
            ├── ColorPickerPortal (overlays)
            └── Footer
```

---

## Distinctive Features

1. **Procedural 3D Animation** - The lava lamp uses metaballs with real-time mesh generation
2. **Custom Shaders** - GLSL vertex/fragment shaders for the lava material
3. **Mouse Interactivity** - Blobs respond to cursor movement with repulsion physics
4. **Theme Flexibility** - Extensive color customization with preset themes + manual picker

---

## Development Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```
