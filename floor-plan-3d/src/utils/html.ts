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
      const keys = Object.create(null);
      const SPEED = 0.18;
      const UP_KEYS = ['arrowup', 'w'];
      const DOWN_KEYS = ['arrowdown', 's'];
      const LEFT_KEYS = ['arrowleft', 'a'];
      const RIGHT_KEYS = ['arrowright', 'd'];

      function markKey(e, down) {
        const k = (e.key || '').toLowerCase();
        keys[k] = down;
      }

      window.addEventListener('keydown', function(e) { markKey(e, true); }, { passive: true });
      window.addEventListener('keyup', function(e) { markKey(e, false); }, { passive: true });
      window.addEventListener('blur', function() {
        for (const k in keys) delete keys[k];
      });

      function hasAny(arr) {
        for (let i = 0; i < arr.length; i++) {
          if (keys[arr[i]]) return true;
        }
        return false;
      }

      function resolveCamera(T) {
        if (window._camera && window._camera.isCamera) return window._camera;
        if (window.camera && window.camera.isCamera) return window.camera;
        for (const k of Object.keys(window)) {
          const v = window[k];
          if (v && v.isCamera) return v;
        }
        return null;
      }

      function resolveControls() {
        if (window._controls && window._controls.target) return window._controls;
        if (window.controls && window.controls.target) return window.controls;
        for (const k of Object.keys(window)) {
          const v = window[k];
          if (v && v.target && v.update && typeof v.update === 'function') return v;
        }
        return null;
      }

      function ensureFocusTarget() {
        if (!document.body) return;
        if (document.body.tabIndex < 0) document.body.tabIndex = 0;
        window.addEventListener('pointerdown', function() {
          try { window.focus(); } catch (_e) {}
          try { document.body.focus(); } catch (_e) {}
        });
      }

      function tryAttach() {
        const T = window.THREE;
        if (!T || !T.Vector3) { setTimeout(tryAttach, 400); return; }

        const cam = resolveCamera(T);
        if (!cam) { setTimeout(tryAttach, 400); return; }

        const controls = resolveControls();
        window._camera = cam;
        if (controls) window._controls = controls;

        const dir = new T.Vector3();
        const right = new T.Vector3();
        const move = new T.Vector3();
        let last = performance.now();

        function tick(now) {
          requestAnimationFrame(tick);

          const dt = Math.min((now - last) / 16.67, 3);
          last = now;

          move.set(0, 0, 0);
          cam.getWorldDirection(dir);
          dir.y = 0;
          if (dir.lengthSq() > 0) dir.normalize();
          right.crossVectors(dir, cam.up).normalize();

          if (hasAny(UP_KEYS)) move.add(dir);
          if (hasAny(DOWN_KEYS)) move.addScaledVector(dir, -1);
          if (hasAny(LEFT_KEYS)) move.addScaledVector(right, -1);
          if (hasAny(RIGHT_KEYS)) move.add(right);
          if (keys['e']) move.y += 1;
          if (keys['q']) move.y -= 1;

          if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(SPEED * dt);
            cam.position.add(move);
            const activeControls = resolveControls();
            if (activeControls && activeControls.target) {
              activeControls.target.add(move);
              if (typeof activeControls.update === 'function') activeControls.update();
            }
          }
        }

        requestAnimationFrame(tick);
      }

      ensureFocusTarget();
      setTimeout(tryAttach, 900);
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

        // Find the voxel scene's floor color to match
        let floorColor = 0x3a3a3a;
        sc.traverse(function(child) {
          if (child.isMesh && child.geometry) {
            var params = child.geometry.parameters;
            // Look for a large flat mesh (floor plane or box)
            if (params) {
              var isWideFlat = (params.width > 20 && params.depth > 20 && (!params.height || params.height < 2))
                || (params.width > 20 && params.height > 20 && params.depth < 2);
              if (isWideFlat && child.material && child.material.color) {
                floorColor = child.material.color.getHex();
              }
            }
          }
        });

        // Ground plane — use a solid box to avoid z-fighting, matching voxel floor color
        const groundMat = new T.MeshLambertMaterial({ color: floorColor });
        const ground = new T.Mesh(
          new T.BoxGeometry(600, 1, 600),
          groundMat
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
        var ambientExists = false;
        sc.children.forEach(function(c) { if (c.isAmbientLight) ambientExists = true; });
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
 * Injects a script that fixes Z-fighting by enabling logarithmic depth buffer,
 * applying polygon offset to all meshes, and adjusting camera near/far planes.
 */
export const fixZFighting = (html: string): string => {
  // Patch the renderer creation to use logarithmic depth buffer from the start
  let patched = html.replace(
    /new\s+THREE\.WebGLRenderer\s*\(\s*\{/g,
    'new THREE.WebGLRenderer({ logarithmicDepthBuffer: true,'
  );

  // Also patch camera near plane for better depth precision
  patched = patched.replace(
    /\.near\s*=\s*0\.1/g,
    '.near = 0.5'
  );

  const script = `
    <script>
    (function() {
      function patchScene() {
        var T = window.THREE;
        if (!T) { setTimeout(patchScene, 500); return; }

        var sc = window.scene;
        if (!sc) {
          var keys = Object.keys(window);
          for (var i = 0; i < keys.length; i++) {
            if (window[keys[i]] instanceof T.Scene) { sc = window[keys[i]]; break; }
          }
        }
        if (!sc) { setTimeout(patchScene, 500); return; }

        // Adjust camera near/far for better depth precision
        var cam = window.camera || window._camera;
        if (cam) {
          cam.near = 0.5;
          cam.far = 5000;
          cam.updateProjectionMatrix();
        }

        // Separate overlapping stair meshes by adding tiny Y offsets.
        // Keep offsets bounded to avoid pushing steps into ceilings.
        var stairIndex = 0;
        sc.traverse(function(child) {
          if (child.isMesh && child.geometry) {
            var params = child.geometry.parameters;
            // Detect stair-like meshes: small boxes stacked vertically
            if (params && params.width && params.height && params.depth) {
              var hasStairName = typeof child.name === 'string' && /stair|step/i.test(child.name);
              var looksLikeStep = (
                params.width <= 8 &&
                params.depth <= 8 &&
                params.height > 0.05 &&
                params.height <= 1.5
              );
              if (hasStairName || looksLikeStep) {
                // Bounded micro-offsets to prevent z-fighting without large drift.
                child.position.y += (stairIndex % 6) * 0.002;
                stairIndex++;
              }
            }
            // Apply polygon offset to all materials
            if (child.material) {
              var mats = Array.isArray(child.material) ? child.material : [child.material];
              for (var m = 0; m < mats.length; m++) {
                mats[m].polygonOffset = true;
                mats[m].polygonOffsetFactor = 1;
                mats[m].polygonOffsetUnits = 1;
                mats[m].needsUpdate = true;
              }
            }
          }
        });

        // Keep stairs below lowest detected ceiling slab to avoid clipping.
        var lowestCeilingBottom = Infinity;
        var stairMeshes = [];
        sc.traverse(function(child) {
          if (!(child && child.isMesh && child.geometry && child.geometry.parameters)) return;
          var p = child.geometry.parameters;
          if (!(p.width && p.height && p.depth)) return;

          var isCeilingLike = (
            p.height <= 0.8 &&
            p.width >= 6 &&
            p.depth >= 6 &&
            child.position &&
            child.position.y > 1
          );
          if (isCeilingLike) {
            var bottom = child.position.y - p.height / 2;
            if (bottom < lowestCeilingBottom) lowestCeilingBottom = bottom;
          }

          var hasStairName = typeof child.name === 'string' && /stair|step/i.test(child.name);
          var looksLikeStep = (
            p.width <= 8 &&
            p.depth <= 8 &&
            p.height > 0.05 &&
            p.height <= 1.5
          );
          if (hasStairName || looksLikeStep) {
            stairMeshes.push(child);
          }
        });

        if (stairMeshes.length > 0 && lowestCeilingBottom < Infinity) {
          var stairTop = -Infinity;
          for (var s = 0; s < stairMeshes.length; s++) {
            var sp = stairMeshes[s].geometry.parameters;
            var top = stairMeshes[s].position.y + sp.height / 2;
            if (top > stairTop) stairTop = top;
          }

          var desiredTop = lowestCeilingBottom - 0.6;
          if (stairTop > desiredTop) {
            var pushDown = stairTop - desiredTop;
            for (var j = 0; j < stairMeshes.length; j++) {
              stairMeshes[j].position.y -= pushDown;
            }
          }
        }
      }

      setTimeout(patchScene, 2000);
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
