/**
 * Extracts a complete HTML document from a string that might contain
 * conversational text, markdown code blocks, etc.
 */
export const extractHtmlFromText = (text: string): string => {
  if (!text) return '';

  const htmlMatch = text.match(/(<!DOCTYPE html>|<html)[\s\S]*?<\/html>/i);
  if (htmlMatch) {
    return htmlMatch[0];
  }

  const codeBlockMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  return text.trim();
};

/**
 * Injects CSS to hide common overlay/text elements in Three.js scenes.
 */
export const hideBodyText = (html: string): string => {
  const cssToInject = `
    <style>
      #info, #loading, #ui, #instructions, .label, .overlay, #description {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
      body { user-select: none !important; }
    </style>
  `;

  if (html.toLowerCase().includes('</head>')) {
    return html.replace(/<\/head>/i, `${cssToInject}</head>`);
  }
  if (html.toLowerCase().includes('</body>')) {
    return html.replace(/<\/body>/i, `${cssToInject}</body>`);
  }
  return html + cssToInject;
};

/**
 * Injects WASD keyboard movement controls into a Three.js scene.
 * Works alongside OrbitControls — translates both camera and orbit target.
 */
export const injectWASDControls = (html: string): string => {
  const script = `
    <script>
    (function() {
      const keys = {};
      const speed = 2;
      window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
      window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

      function tryAttach() {
        const camera = window._camera || (typeof camera !== 'undefined' ? camera : null);
        const controls = window._controls || (typeof controls !== 'undefined' ? controls : null);
        if (!camera) { setTimeout(tryAttach, 500); return; }

        const move = new (window.THREE || { Vector3: class {} }).Vector3();
        function update() {
          requestAnimationFrame(update);
          const dir = new (window.THREE.Vector3)();
          camera.getWorldDirection(dir);
          dir.y = 0; dir.normalize();
          const right = new (window.THREE.Vector3)().crossVectors(dir, camera.up).normalize();

          move.set(0, 0, 0);
          if (keys['w']) move.add(dir.clone().multiplyScalar(speed));
          if (keys['s']) move.add(dir.clone().multiplyScalar(-speed));
          if (keys['a']) move.add(right.clone().multiplyScalar(-speed));
          if (keys['d']) move.add(right.clone().multiplyScalar(speed));
          if (keys['e']) move.y += speed;
          if (keys['q']) move.y -= speed;

          if (move.length() > 0) {
            const delta = move.multiplyScalar(0.05);
            camera.position.add(delta);
            if (controls && controls.target) controls.target.add(delta);
          }
        }
        update();
      }

      // Try to find camera/controls after scene initializes
      setTimeout(() => {
        // Look for common variable patterns in generated Three.js code
        const iframe = window;
        if (iframe.camera) { window._camera = iframe.camera; }
        if (iframe.controls) { window._controls = iframe.controls; }
        tryAttach();
      }, 1000);
    })();
    </script>
  `;

  if (html.toLowerCase().includes('</body>')) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return html + script;
};

/**
 * Injects a static procedural city environment around the voxel scene.
 * Adds ground plane, surrounding buildings, roads, and sky gradient.
 */
export const injectCityEnvironment = (html: string): string => {
  const script = `
    <script>
    (function() {
      function buildCity() {
        const T = window.THREE;
        if (!T) { setTimeout(buildCity, 500); return; }

        // Find the scene
        let sc = window.scene;
        if (!sc) {
          // Try to find scene from renderer
          const canvases = document.querySelectorAll('canvas');
          if (!canvases.length) { setTimeout(buildCity, 500); return; }
          // Fallback: traverse window properties
          for (const k of Object.keys(window)) {
            if (window[k] instanceof T.Scene) { sc = window[k]; break; }
          }
        }
        if (!sc) { setTimeout(buildCity, 500); return; }

        const cityGroup = new T.Group();
        cityGroup.name = 'city_environment';

        // Enable logarithmic depth buffer on renderer if possible
        const renderer = window.renderer;
        if (renderer) { renderer.logarithmicDepthBuffer = true; }

        // Ground plane — use a solid box to avoid z-fighting
        const ground = new T.Mesh(
          new T.BoxGeometry(600, 1, 600),
          new T.MeshLambertMaterial({ color: 0x3a3a3a })
        );
        ground.position.y = -1;
        ground.receiveShadow = true;
        cityGroup.add(ground);

        // Road — raised box, no coplanar planes
        const road = new T.Mesh(
          new T.BoxGeometry(120, 0.2, 120),
          new T.MeshLambertMaterial({ color: 0x555555 })
        );
        road.position.y = -0.4;
        cityGroup.add(road);

        // Road markings — thin boxes raised above road
        const dashMat = new T.MeshLambertMaterial({ color: 0xdddd44 });
        for (let i = -55; i <= 55; i += 6) {
          const dash = new T.Mesh(new T.BoxGeometry(2, 0.1, 0.3), dashMat);
          dash.position.set(i, -0.2, -45);
          cityGroup.add(dash);
          const dash2 = new T.Mesh(new T.BoxGeometry(0.3, 0.1, 2), dashMat);
          dash2.position.set(-45, -0.2, i);
          cityGroup.add(dash2);
        }

        // Sidewalk — solid boxes clearly above road
        const sidewalkMat = new T.MeshLambertMaterial({ color: 0x999999 });
        const swPositions = [
          { x: 0, z: -52, sx: 110, sz: 4 },
          { x: 0, z: 52, sx: 110, sz: 4 },
          { x: -52, z: 0, sx: 4, sz: 110 },
          { x: 52, z: 0, sx: 4, sz: 110 },
        ];
        swPositions.forEach(p => {
          const sw = new T.Mesh(new T.BoxGeometry(p.sx, 0.4, p.sz), sidewalkMat);
          sw.position.set(p.x, -0.3, p.z);
          cityGroup.add(sw);
        });

        // Building colors
        const bColors = [0x8899aa, 0x7788aa, 0x667799, 0x99aabb, 0x6677888, 0xaabbcc, 0x556677, 0x778899];
        const windowColor = 0xffffcc;

        // Seeded random for consistency
        let seed = 42;
        function rand() { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; }

        // Generate city blocks on all four sides
        const zones = [
          { xMin: -280, xMax: -60, zMin: -280, zMax: -60 },
          { xMin: 60, xMax: 280, zMin: -280, zMax: -60 },
          { xMin: -280, xMax: -60, zMin: 60, zMax: 280 },
          { xMin: 60, xMax: 280, zMin: 60, zMax: 280 },
          { xMin: -280, xMax: -60, zMin: -50, zMax: 50 },
          { xMin: 60, xMax: 280, zMin: -50, zMax: 50 },
          { xMin: -50, xMax: 50, zMin: -280, zMax: -60 },
          { xMin: -50, xMax: 50, zMin: 60, zMax: 280 },
        ];

        zones.forEach(zone => {
          let x = zone.xMin;
          while (x < zone.xMax) {
            let z = zone.zMin;
            while (z < zone.zMax) {
              const w = 8 + rand() * 15;
              const d = 8 + rand() * 15;
              const h = 10 + rand() * 50;
              const color = bColors[Math.floor(rand() * bColors.length)];

              const bGeo = new T.BoxGeometry(w, h, d);
              const bMat = new T.MeshLambertMaterial({ color });
              const building = new T.Mesh(bGeo, bMat);
              building.position.set(x + w/2, h/2 - 0.5, z + d/2);
              building.castShadow = true;
              building.receiveShadow = true;
              cityGroup.add(building);

              // Windows
              const wMat = new T.MeshBasicMaterial({ color: rand() > 0.3 ? windowColor : 0x334455 });
              const floors = Math.floor(h / 4);
              for (let f = 0; f < floors; f++) {
                const wy = 2 + f * 4 + h/2 - h - 0.5 + h;
                // Front and back windows
                for (let wx = -w/2 + 2; wx < w/2 - 1; wx += 3) {
                  if (rand() > 0.4) {
                    const win = new T.Mesh(new T.PlaneGeometry(1.5, 2), wMat);
                    win.position.set(x + w/2 + wx, wy - h/2, z);
                    cityGroup.add(win);
                  }
                }
              }

              z += d + 3 + rand() * 8;
            }
            x += 25 + rand() * 10;
          }
        });

        // Trees along sidewalks
        const treeTrunkMat = new T.MeshLambertMaterial({ color: 0x8B4513 });
        const treeLeafMat = new T.MeshLambertMaterial({ color: 0x228B22 });
        for (let i = -50; i <= 50; i += 12) {
          [{ x: i, z: -56 }, { x: i, z: 56 }, { x: -56, z: i }, { x: 56, z: i }].forEach(p => {
            const trunk = new T.Mesh(new T.CylinderGeometry(0.3, 0.4, 3), treeTrunkMat);
            trunk.position.set(p.x, 1, p.z);
            cityGroup.add(trunk);
            const leaves = new T.Mesh(new T.SphereGeometry(2, 6, 6), treeLeafMat);
            leaves.position.set(p.x, 3.5, p.z);
            cityGroup.add(leaves);
          });
        }

        // Sky gradient
        if (sc.background === null || sc.background === undefined) {
          const canvas = document.createElement('canvas');
          canvas.width = 1; canvas.height = 256;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const grad = ctx.createLinearGradient(0, 0, 0, 256);
            grad.addColorStop(0, '#1a2a4a');
            grad.addColorStop(0.4, '#4a7ab5');
            grad.addColorStop(0.7, '#87CEEB');
            grad.addColorStop(1.0, '#b8d4e8');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1, 256);
            const tex = new T.CanvasTexture(canvas);
            tex.mapping = T.EquirectangularReflectionMapping;
            sc.background = tex;
          }
        }

        // Add ambient light if scene is dark
        const ambientExists = sc.children.some((c: any) => c.isAmbientLight);
        if (!ambientExists) {
          sc.add(new T.AmbientLight(0xffffff, 0.4));
        }

        // Sun directional light
        const sun = new T.DirectionalLight(0xfff5e6, 0.6);
        sun.position.set(100, 150, 80);
        sun.castShadow = true;
        cityGroup.add(sun);

        sc.add(cityGroup);
      }

      setTimeout(buildCity, 1500);
    })();
    </script>
  `;

  if (html.toLowerCase().includes('</body>')) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return html + script;
};

/**
 * Zooms the camera closer by scaling camera.position.set() values.
 */
export const zoomCamera = (html: string, zoomFactor: number = 0.8): string => {
  const regex = /camera\.position\.set\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/g;

  return html.replace(regex, (_match, x, y, z) => {
    const newX = parseFloat(x) * zoomFactor;
    const newY = parseFloat(y) * zoomFactor;
    const newZ = parseFloat(z) * zoomFactor;
    return `camera.position.set(${newX}, ${newY}, ${newZ})`;
  });
};
