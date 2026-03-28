import './style.css';

// ============================================
// Scroll-Linked Video Scrubbing Engine v2
// Frame pre-extraction + canvas rendering
// ============================================

const videoCanvas = document.getElementById('video-canvas') as HTMLCanvasElement;
const videoCtx = videoCanvas.getContext('2d', { alpha: false })!;
const particleCanvas = document.getElementById('particles') as HTMLCanvasElement;
const particleCtx = particleCanvas.getContext('2d')!;
const video = document.getElementById('source-video') as HTMLVideoElement;
const loader = document.getElementById('loader')!;
const progressBar = document.getElementById('progress-bar')!;
const panelInners = document.querySelectorAll<HTMLElement>('.panel__inner');

// ---- Frame extraction for instant scrubbing ----
const FRAME_COUNT = 180; // extract ~180 frames for smooth scrub
let frames: ImageBitmap[] = [];
let framesReady = false;

// ---- Canvas sizing ----
const dpr = Math.min(devicePixelRatio, 2); // cap at 2x for perf

function resizeCanvases() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  videoCanvas.width = w * dpr;
  videoCanvas.height = h * dpr;
  videoCanvas.style.width = w + 'px';
  videoCanvas.style.height = h + 'px';
  particleCanvas.width = w * dpr;
  particleCanvas.height = h * dpr;
  particleCanvas.style.width = w + 'px';
  particleCanvas.style.height = h + 'px';
}

resizeCanvases();
window.addEventListener('resize', resizeCanvases);

// ---- Extract frames from video ----
async function extractFrames(): Promise<void> {
  return new Promise((resolve) => {
    const onReady = async () => {
      const duration = video.duration;
      if (!duration || !isFinite(duration)) {
        resolve();
        return;
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const tempCtx = tempCanvas.getContext('2d', { alpha: false })!;

      for (let i = 0; i < FRAME_COUNT; i++) {
        const time = (i / (FRAME_COUNT - 1)) * duration;
        video.currentTime = time;

        await new Promise<void>((res) => {
          video.addEventListener('seeked', () => {
            tempCtx.drawImage(video, 0, 0);
            createImageBitmap(tempCanvas).then((bmp) => {
              frames[i] = bmp;
              res();
            });
          }, { once: true });
        });
      }

      framesReady = true;
      resolve();
    };

    if (video.readyState >= 2) {
      onReady();
    } else {
      video.addEventListener('loadeddata', onReady, { once: true });
    }
  });
}

// ---- Draw frame to canvas (cover-fit) ----
function drawFrame(source: ImageBitmap | HTMLVideoElement) {
  const cw = videoCanvas.width;
  const ch = videoCanvas.height;
  const sw = source instanceof ImageBitmap ? source.width : source.videoWidth;
  const sh = source instanceof ImageBitmap ? source.height : source.videoHeight;

  if (!sw || !sh) return;

  const canvasRatio = cw / ch;
  const srcRatio = sw / sh;

  let cropX: number, cropY: number, cropW: number, cropH: number;

  if (srcRatio > canvasRatio) {
    cropH = sh;
    cropW = sh * canvasRatio;
    cropX = (sw - cropW) / 2;
    cropY = 0;
  } else {
    cropW = sw;
    cropH = sw / canvasRatio;
    cropX = 0;
    cropY = (sh - cropH) / 2;
  }

  videoCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cw, ch);
}

// ---- Smooth scroll tracking ----
let scrollFraction = 0;
let smoothScroll = 0;
let prevSmoothScroll = 0;
let scrollVelocity = 0;

function getScrollFraction(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.min(Math.max(window.scrollY / max, 0), 1);
}

// ---- Particles system ----
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

const particles: Particle[] = [];
const MAX_PARTICLES = 50;

function spawnParticle() {
  if (particles.length >= MAX_PARTICLES) return;
  const w = particleCanvas.width;
  const h = particleCanvas.height;
  particles.push({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -Math.random() * 0.5 - 0.1,
    size: Math.random() * 2 + 0.5,
    alpha: 0,
    life: 0,
    maxLife: Math.random() * 400 + 200,
  });
}

function updateParticles() {
  particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

  // Spawn a few per frame
  if (Math.random() < 0.3) spawnParticle();

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life++;
    p.x += p.vx + scrollVelocity * 20;
    p.y += p.vy;

    // Fade in then out
    const progress = p.life / p.maxLife;
    if (progress < 0.1) {
      p.alpha = progress / 0.1;
    } else if (progress > 0.7) {
      p.alpha = (1 - progress) / 0.3;
    } else {
      p.alpha = 1;
    }

    if (p.life >= p.maxLife) {
      particles.splice(i, 1);
      continue;
    }

    particleCtx.beginPath();
    particleCtx.arc(p.x, p.y, p.size * dpr, 0, Math.PI * 2);
    particleCtx.fillStyle = `rgba(212, 168, 83, ${p.alpha * 0.25})`;
    particleCtx.fill();
  }
}

// ---- Parallax on panels ----
function updateParallax() {
  const viewportCenter = window.scrollY + window.innerHeight / 2;

  panelInners.forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    const panelCenter = window.scrollY + rect.top + rect.height / 2;
    const offset = (viewportCenter - panelCenter) / window.innerHeight;
    const parallaxY = offset * -20; // subtle parallax

    if (panel.classList.contains('visible')) {
      panel.style.transform = `translateY(${parallaxY}px)`;
    }
  });
}

// ---- Main animation loop ----
function tick() {
  scrollFraction = getScrollFraction();

  // Adaptive smoothing — faster LERP when delta is large (quick scrolls)
  const delta = scrollFraction - smoothScroll;
  const absDelta = Math.abs(delta);
  const lerpSpeed = absDelta > 0.05 ? 0.12 : absDelta > 0.01 ? 0.08 : 0.05;
  smoothScroll += delta * lerpSpeed;

  // Track velocity for particle drift
  scrollVelocity = smoothScroll - prevSmoothScroll;
  prevSmoothScroll = smoothScroll;

  // Update progress bar
  progressBar.style.width = (smoothScroll * 100) + '%';

  // Draw the right frame
  if (framesReady && frames.length > 0) {
    const frameIndex = Math.round(smoothScroll * (frames.length - 1));
    const clampedIndex = Math.max(0, Math.min(frames.length - 1, frameIndex));
    if (frames[clampedIndex]) {
      drawFrame(frames[clampedIndex]);
    }
  } else if (video.readyState >= 2 && video.duration && isFinite(video.duration)) {
    // Fallback: direct video seeking
    const targetTime = smoothScroll * video.duration;
    if (Math.abs(video.currentTime - targetTime) > 0.03) {
      video.currentTime = targetTime;
    }
    drawFrame(video);
  }

  updateParticles();
  updateParallax();

  requestAnimationFrame(tick);
}

// ---- Intersection Observer for panel reveal ----
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  {
    threshold: 0.12,
    rootMargin: '0px 0px -5% 0px',
  }
);

panelInners.forEach((panel) => observer.observe(panel));

// ---- Handle seeked for fallback mode ----
video.addEventListener('seeked', () => {
  if (!framesReady) drawFrame(video);
});

// ---- Init ----
async function init() {
  video.load();

  // Start the render loop immediately with fallback mode
  requestAnimationFrame(tick);

  // Extract frames in background
  await extractFrames();

  // Hide loader
  loader.classList.add('hidden');
}

init();
