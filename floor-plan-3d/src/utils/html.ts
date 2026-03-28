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
