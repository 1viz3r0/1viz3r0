import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useMemo, useState, useEffect, Suspense, memo } from "react";
import * as THREE from "three";
import React from "react";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// Particle counts matching reference implementation
const PARTICLE_COUNT = 15000;
const SPARK_COUNT = 2000;
const STAR_COUNT = 7000;

const PALETTE_HEX = [0x261e35, 0x5f2da0, 0x8e55e8, 0xc78aff, 0x00cfff, 0xf5cfff];

function normalize(points: THREE.Vector3[], size: number) {
  if (!points || points.length === 0) return [];
  const box = new THREE.Box3().setFromPoints(points);
  const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray()) || 1;
  const center = box.getCenter(new THREE.Vector3());
  return points.map((p) => p.clone().sub(center).multiplyScalar(size / maxDim));
}

// ---- Patterns ----
function torusKnot(n: number) {
  const geometry = new THREE.TorusKnotGeometry(10, 3, 200, 16, 2, 3);
  const points: THREE.Vector3[] = [];
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    points.push(new THREE.Vector3().fromBufferAttribute(position, i));
  }
  
  // Dispose temporary geometry to prevent memory leaks
  geometry.dispose();
  
  // Ensure exactly n points before normalizing
  let pts = points.slice(0, Math.min(points.length, n));
  while (pts.length < n) {
    const clone = pts[Math.floor(Math.random() * pts.length)]?.clone() ?? new THREE.Vector3();
    pts.push(clone);
  }
  
  // Normalize and return exactly n points - smaller size for centered effect
  return normalize(pts.slice(0, n), 20);
}

function halvorsen(n: number) {
  const pts: THREE.Vector3[] = [];
  let x = 0.1, y = 0, z = 0;
  const a = 1.89, dt = 0.005;
  const maxIterations = n * 50; // Increased to ensure we get enough points
  
  for (let i = 0; i < maxIterations; i++) {
    const dx = -a * x - 4 * y - 4 * z - y * y;
    const dy = -a * y - 4 * z - 4 * x - z * z;
    const dz = -a * z - 4 * x - 4 * y - x * x;
    x += dx * dt; y += dy * dt; z += dz * dt;
    if (i > 200 && i % 25 === 0) {
      pts.push(new THREE.Vector3(x, y, z));
      if (pts.length >= n) break;
    }
  }
  
  // Ensure exactly n points before normalizing
  while (pts.length < n) {
    const clone = pts[Math.floor(Math.random() * pts.length)]?.clone() ?? new THREE.Vector3();
    pts.push(clone);
  }
  
  // Normalize and return exactly n points - smaller size for centered effect
  return normalize(pts.slice(0, n), 20);
}

function dualHelix(n: number) {
  const pts: THREE.Vector3[] = [];
  const turns = 5, radius = 15, height = 40;
  for (let i = 0; i < n; i++) {
    const isSecond = i % 2 === 0;
    const angle = (i / n) * Math.PI * 2 * turns;
    const y = (i / n) * height - height / 2;
    const r = radius + (isSecond ? 5 : -5);
    pts.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r));
  }
  
  // Ensure exactly n points before normalizing (dualHelix should already generate n, but verify)
  while (pts.length < n) {
    const clone = pts[Math.floor(Math.random() * pts.length)]?.clone() ?? new THREE.Vector3();
    pts.push(clone);
  }
  
  // Normalize and return exactly n points - smaller size for centered effect
  return normalize(pts.slice(0, n), 20);
}

function deJong(n: number) {
  const pts: THREE.Vector3[] = [];
  let x = 0.1, y = 0.1;
  const a = 1.4, b = -2.3, c = 2.4, d = -2.1;
  for (let i = 0; i < n; i++) {
    const xn = Math.sin(a * y) - Math.cos(b * x);
    const yn = Math.sin(c * x) - Math.cos(d * y);
    x = xn; y = yn;
    pts.push(new THREE.Vector3(x, y, Math.sin(x * y * 0.5)));
  }
  
  // Ensure exactly n points before normalizing (deJong should already generate n, but verify)
  while (pts.length < n) {
    const clone = pts[Math.floor(Math.random() * pts.length)]?.clone() ?? new THREE.Vector3();
    pts.push(clone);
  }
  
  // Normalize and return exactly n points - smaller size for centered effect
  return normalize(pts.slice(0, n), 20);
}

const PATTERNS = [torusKnot, halvorsen, dualHelix, deJong];

// ---- Stars ----
function Stars() {
  const starsRef = useRef<THREE.Points>(null!);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  
  const { positions, colors, sizes, randoms } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const randoms = new Float32Array(STAR_COUNT);
    const R = 200; // Larger radius for star streaks effect
    for (let i = 0; i < STAR_COUNT; i++) {
      const i3 = i * 3;
      const θ = Math.random() * 2 * Math.PI;
      const φ = Math.acos(2 * Math.random() - 1);
      const r = R * Math.cbrt(Math.random());
      positions[i3] = r * Math.sin(φ) * Math.cos(θ);
      positions[i3 + 1] = r * Math.sin(φ) * Math.sin(θ);
      positions[i3 + 2] = r * Math.cos(φ);

      // Stars: small random pastel variations biased toward bluish/purple (matching reference)
      const color = new THREE.Color().setHSL(0.65 + Math.random() * 0.15, 0.2 + Math.random() * 0.6, 0.5 + Math.random() * 0.4);
      colors[i3] = color.r; colors[i3 + 1] = color.g; colors[i3 + 2] = color.b;
      
      // Calculate distance from center
      const distFromCenter = Math.sqrt(positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2);
      // Make stars bigger if they're closer to the center (around the morph)
      const baseSize = 0.15 + Math.pow(Math.random(), 4) * 1.0;
      // Stars within radius 150 get bigger, with max size at center
      const morphRadius = 150;
      const sizeMultiplier = distFromCenter < morphRadius ? 1.0 + (1.0 - distFromCenter / morphRadius) * 4.5 : 1.0;
      sizes[i] = baseSize * sizeMultiplier;
      
      randoms[i] = Math.random() * Math.PI * 2;
    }
    return { positions, colors, sizes, randoms };
  }, []);

  const mat = useMemo(() => {
    // Dispose previous material if it exists
    if (materialRef.current) {
      materialRef.current.dispose();
    }
    
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        attribute float size; attribute float random;
        varying vec3 vColor; varying float vRnd;
        void main() {
          vColor = color; vRnd = random;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (150.0 / -mv.z); // Reduced to prevent merging
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float time; varying vec3 vColor; varying float vRnd;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = 1.0 - smoothstep(0.4, 0.5, d);
          a *= 0.7 + 0.3 * sin(time * (1.2 + vRnd * 0.6) + vRnd * 5.0); // Faster twinkling
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending, // Additive blending for glowing loop effect
    });
    
    materialRef.current = material;
    return material;
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
      }
      if (materialRef.current) {
        materialRef.current.dispose();
      }
    };
  }, []);

  useFrame(({ clock }) => {
    try {
      if (!pointsObject || !mat) return;
      
      const m = mat as THREE.ShaderMaterial;
      if (m.uniforms && m.uniforms.time) {
        m.uniforms.time.value = clock.getElapsedTime();
      }
      pointsObject.rotation.y = clock.getElapsedTime() * 0.03; // Faster rotation
    } catch (error) {
      console.error('❌ [Stars] Error in useFrame:', error);
    }
  });

  // Create geometry manually to ensure attributes are set
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute('random', new THREE.BufferAttribute(randoms, 1));
    geometryRef.current = geom;
    console.log('✅ [Stars] Geometry created with', positions.length / 3, 'vertices');
    return geom;
  }, [positions, colors, sizes, randoms]);
  
  // Create points object separately and update material when it changes
  const pointsObject = useMemo(() => {
    return new THREE.Points(geometry, mat);
  }, [geometry, mat]);
  
  useEffect(() => {
    if (pointsObject && mat) {
      pointsObject.material = mat;
    }
  }, [pointsObject, mat]);

  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
      }
    };
  }, []);

  return (
    <primitive object={pointsObject} ref={starsRef} />
  );
}

// ---- Morphing Particles ----
function MorphingParticles() {
  const ref = useRef<THREE.Points>(null!);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const [pattern, setPattern] = useState(0);
  const morphData = useRef<{ from: Float32Array; to: Float32Array } | null>(null);
  const morphProgress = useRef(0);
  const [isMorphing, setIsMorphing] = useState(false);

  const { positions, colors, sizes, randoms } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const randoms = new Float32Array(PARTICLE_COUNT * 3);
    const palette = PALETTE_HEX.map((c) => new THREE.Color(c));
    // Generate initial pattern with error handling
    let basePts: THREE.Vector3[];
    try {
      basePts = PATTERNS[0](PARTICLE_COUNT);
    } catch (error) {
      console.error('❌ [MorphingParticles] Error generating initial pattern:', error);
      // Fallback to zero vectors if pattern generation fails
      basePts = Array(PARTICLE_COUNT).fill(null).map(() => new THREE.Vector3(0, 0, 0));
    }
    
    // Ensure basePts has exactly PARTICLE_COUNT points
    if (!basePts || !Array.isArray(basePts) || basePts.length === 0) {
      console.warn(`⚠️ [MorphingParticles] Initial pattern invalid, creating fallback pattern`);
      basePts = Array(PARTICLE_COUNT).fill(null).map(() => new THREE.Vector3(0, 0, 0));
    }
    
    if (basePts.length < PARTICLE_COUNT) {
      console.warn(`⚠️ [MorphingParticles] Initial pattern has ${basePts.length} points, expected ${PARTICLE_COUNT}. Padding...`);
      while (basePts.length < PARTICLE_COUNT) {
        const randomIndex = Math.floor(Math.random() * Math.max(1, basePts.length));
        if (basePts[randomIndex]) {
          basePts.push(basePts[randomIndex].clone());
        } else {
          basePts.push(new THREE.Vector3(0, 0, 0));
        }
      }
    }
    
    // Ensure we don't exceed PARTICLE_COUNT
    basePts = basePts.slice(0, PARTICLE_COUNT);
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const p = basePts[i];
      
      // Validate point before using
      if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') {
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;
      } else {
        // Fallback to zero if point is invalid
        positions[i3] = 0;
        positions[i3 + 1] = 0;
        positions[i3 + 2] = 0;
      }
      // Use palette colors with HSL variations (matching reference)
      const palette = PALETTE_HEX.map(c => new THREE.Color(c));
      const base = palette[Math.floor(Math.random() * palette.length)];
      const hsl = { h: 0, s: 0, l: 0 };
      base.getHSL(hsl);
      hsl.h += (Math.random() - 0.5) * 0.05;
      hsl.s = Math.min(1, Math.max(0.6, hsl.s + (Math.random() - 0.5) * 0.25));
      hsl.l = Math.min(0.95, Math.max(0.45, hsl.l + (Math.random() - 0.5) * 0.35));
      const c = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
      colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      sizes[i] = 0.4 + Math.random() * 0.6; // Smaller particles to prevent merging
      randoms[i3] = Math.random() * 10;
      randoms[i3 + 1] = Math.random() * Math.PI * 2;
      randoms[i3 + 2] = Math.random();
    }
    return { positions, colors, sizes, randoms };
  }, []);

  const mat = useMemo(() => {
    // Dispose previous material if it exists
    if (materialRef.current) {
      materialRef.current.dispose();
    }
    
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, hueSpeed: { value: 0.12 } },
        vertexShader: `
        uniform float time;
        attribute float size;
        attribute vec3 random;
        varying vec3 vCol;
        varying float vR;
        void main(){
          vCol = color; vR = random.z;
          vec3 p = position;
          float t = time * .25 * random.z;
          float ax = t + random.y, ay = t * .75 + random.x;
          // Minimal amplitude to keep particles centered - particles stay very close to base position
          float amp = (.08 + sin(random.x + t * .6) * .04) * random.z;
          // Apply animation but clamp to keep particles within reasonable bounds
          float animX = sin(ax + p.y * .06 + random.x * .1) * amp;
          float animY = cos(ay + p.z * .06 + random.y * .1) * amp;
          float animZ = sin(ax * .85 + p.x * .06 + random.z * .1) * amp;
          // Clamp animation to prevent particles from moving too far from center
          float maxDist = 25.0; // Maximum distance from origin
          vec3 animatedPos = vec3(p.x + animX, p.y + animY, p.z + animZ);
          float dist = length(animatedPos);
          if (dist > maxDist) {
            animatedPos = normalize(animatedPos) * maxDist;
          }
          vec4 mv = modelViewMatrix * vec4(animatedPos, 1.);
          float pulse = .9 + .1 * sin(time * 1.15 + random.y);
          gl_PointSize = size * pulse * (300.0 / -mv.z); // Increased for better visibility
          gl_Position = projectionMatrix * mv;
        }`,
        fragmentShader: `
        uniform float time;
        uniform float hueSpeed;
        varying vec3 vCol;
        varying float vR;
        vec3 hueShift(vec3 c, float h) {
          const vec3 k = vec3(0.57735);
          float cosA = cos(h);
          float sinA = sin(h);
          return c * cosA + cross(k, c) * sinA + k * dot(k, c) * (1.0 - cosA);
        }
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float core = smoothstep(0.05, 0.0, d);
          float angle = atan(uv.y, uv.x);
          float flare = pow(max(0.0, sin(angle * 6.0 + time * 2.0 * vR)), 4.0);
          flare *= smoothstep(0.5, 0.0, d);
          float glow = smoothstep(0.4, 0.1, d);
          float alpha = core * 1.0 + flare * 0.5 + glow * 0.2;
          vec3 color = hueShift(vCol, time * hueSpeed);
          vec3 finalColor = mix(color, vec3(1.0, 0.95, 0.9), core);
          finalColor = mix(finalColor, color, flare * 0.5 + glow * 0.5);
          if (alpha < 0.005) discard; // Lower threshold to keep more particles visible
          gl_FragColor = vec4(finalColor, alpha);
        }`,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending, // Additive blending for glowing loop effect
    });
    
    materialRef.current = material;
    return material;
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
      }
      if (materialRef.current) {
        materialRef.current.dispose();
      }
    };
  }, []);

  // Create geometry manually to ensure attributes are set
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute('random', new THREE.BufferAttribute(randoms, 3));
    geometryRef.current = geom;
    console.log('✅ [MorphingParticles] Geometry created with', positions.length / 3, 'vertices');
    return geom;
  }, [positions, colors, sizes, randoms]);
  
  // Create points object separately and update material when it changes
  const pointsObject = useMemo(() => {
    return new THREE.Points(geometry, mat);
  }, [geometry, mat]);
  
  useEffect(() => {
    if (pointsObject && mat) {
      pointsObject.material = mat;
    }
  }, [pointsObject, mat]);

  useFrame(({ clock }) => {
    try {
      // Safety check: ensure material and uniforms exist
      if (!mat || !mat.uniforms || !mat.uniforms.time) {
        return;
      }
      
      mat.uniforms.time.value = clock.getElapsedTime();
      
      // Log once per 10 seconds to verify particles are rendering (less spam)
      if (Math.floor(clock.getElapsedTime()) % 10 === 0 && Math.floor(clock.getElapsedTime() * 10) % 10 === 0) {
        if (pointsObject) {
          const pos = pointsObject.position;
          const visible = pointsObject.visible;
          const material = pointsObject.material as THREE.ShaderMaterial;
          // Debug logging removed for performance
          // console.log('✅ [MorphingParticles] Rendering:', {
          //   visible,
          //   position: [pos.x, pos.y, pos.z],
          //   materialType: material?.type,
          //   uniformsTime: material?.uniforms?.time?.value,
          // });
        }
      }
      
      // Safety check: ensure pointsObject, geometry, and attributes exist before morphing
      if (isMorphing && morphData.current && pointsObject?.geometry) {
        const posAttr = pointsObject.geometry.attributes.position;
        
        // Validate geometry attribute before morphing (silent validation - no warnings)
        if (!posAttr || !posAttr.array || posAttr.count !== PARTICLE_COUNT) {
          setIsMorphing(false);
          morphData.current = null;
          return;
        }
        
        // Additional safety checks (silent validation)
        if (!morphData.current.from || !morphData.current.to) {
          setIsMorphing(false);
          morphData.current = null;
          return;
        }
        
        // Ensure array lengths match expected count (silent validation)
        const expectedLength = PARTICLE_COUNT * 3;
        if (posAttr.array.length !== expectedLength || 
            morphData.current.from.length !== expectedLength ||
            morphData.current.to.length !== expectedLength) {
          setIsMorphing(false);
          morphData.current = null;
          return;
        }
        
        morphProgress.current += 0.03;
        const progress = morphProgress.current >= 1 ? 1 : 1 - Math.pow(1 - morphProgress.current, 3);
        const { from, to } = morphData.current;
        
        // Perform morphing with bounds checking
        try {
          for (let i = 0; i < posAttr.array.length && i < from.length && i < to.length; i++) {
            posAttr.array[i] = from[i] + (to[i] - from[i]) * progress;
          }
          posAttr.needsUpdate = true;
          
          if (morphProgress.current >= 1) {
            setIsMorphing(false);
            morphData.current = null;
          }
        } catch (error) {
          console.error('❌ [MorphingParticles] Error during morphing:', error);
          setIsMorphing(false);
          morphData.current = null;
        }
      }
    } catch (error) {
      console.error('❌ [MorphingParticles] Error in useFrame:', error);
    }
  });

  useEffect(() => {
    // Wait for geometry to be ready before starting morphing interval
    const checkGeometry = () => {
      if (!pointsObject?.geometry?.attributes?.position?.array) {
        return false;
      }
      const posAttr = pointsObject.geometry.attributes.position;
      return posAttr && posAttr.array && posAttr.array.length === PARTICLE_COUNT * 3;
    };
    
    let interval: NodeJS.Timeout | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;
    
    const startMorphingInterval = () => {
      if (interval) {
        clearInterval(interval);
      }
      
      interval = setInterval(() => {
        try {
          // Safety checks before accessing geometry (silent validation)
          if (isMorphing) return;
          if (!pointsObject?.geometry?.attributes?.position?.array) {
            return;
          }
          
          const posAttr = pointsObject.geometry.attributes.position;
          // Validate geometry attribute before accessing (silent validation)
          if (!posAttr || !posAttr.array || posAttr.count !== PARTICLE_COUNT || posAttr.array.length !== PARTICLE_COUNT * 3) {
            return;
          }
          
          const next = (pattern + 1) % PATTERNS.length;
          
          // Create a copy of current positions
          const from = new Float32Array(posAttr.array);
          
          // Generate new pattern (patterns are now guaranteed to return exactly PARTICLE_COUNT points)
          let toPts: THREE.Vector3[];
          try {
            toPts = PATTERNS[next](PARTICLE_COUNT);
          } catch (error) {
            // Pattern generation failed - skip this morph cycle
            console.error('❌ [MorphingParticles] Pattern generation failed:', error);
            return;
          }
          
          // Patterns are guaranteed to return exactly PARTICLE_COUNT points, so we can safely convert
          const to = new Float32Array(PARTICLE_COUNT * 3);
          for (let j = 0; j < PARTICLE_COUNT; j++) {
            const idx = j * 3;
            const p = toPts[j];
            // Patterns guarantee valid points, but keep safety check just in case
            if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') {
              to[idx] = p.x;
              to[idx + 1] = p.y;
              to[idx + 2] = p.z;
            } else {
              // This should never happen now, but keep as fallback
              to[idx] = 0;
              to[idx + 1] = 0;
              to[idx + 2] = 0;
            }
          }
          
          morphData.current = { from, to };
          morphProgress.current = 0;
          setIsMorphing(true);
          setPattern(next);
        } catch (error) {
          console.error('❌ [MorphingParticles] Error in morphing interval:', error);
          setIsMorphing(false);
          morphData.current = null;
        }
      }, 3000);
    };
    
    // Initial delay to ensure geometry is initialized
    const timeout = setTimeout(() => {
      if (!checkGeometry()) {
        // Single retry instead of multiple retries to prevent state spam
        retryTimeout = setTimeout(() => {
          if (checkGeometry()) {
            console.log('✅ [MorphingParticles] Geometry ready after retry, starting morphing');
            startMorphingInterval();
          }
        }, 1000);
      } else {
        console.log('✅ [MorphingParticles] Geometry ready, starting morphing');
        startMorphingInterval();
      }
    }, 1000); // Wait 1 second for geometry to initialize
    
    return () => {
      clearTimeout(timeout);
      if (retryTimeout) clearTimeout(retryTimeout);
      if (interval) clearInterval(interval);
    };
  }, [pattern, isMorphing, pointsObject]);

  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
      }
    };
  }, []);

  return (
    <primitive object={pointsObject} ref={ref} />
  );
}

// ---- Resize Handler ----
function ResizeHandler() {
  const { gl, camera, size } = useThree();
  
  useEffect(() => {
    const handleResize = () => {
      // Get actual viewport dimensions - use the largest available dimension
      // This accounts for browser zoom, device pixel ratio, and any scaling
      const viewportWidth = Math.max(
        window.innerWidth || 0,
        document.documentElement.clientWidth || 0,
        document.documentElement.scrollWidth || 0,
        document.body.clientWidth || 0,
        screen.width || 0
      );
      const viewportHeight = Math.max(
        window.innerHeight || 0,
        document.documentElement.clientHeight || 0,
        document.documentElement.scrollHeight || 0,
        document.body.clientHeight || 0,
        screen.height || 0
      );
      
      // Find the wrapper div and force it to full viewport
      const wrapper = document.getElementById('morphing-scene-wrapper');
      if (wrapper) {
        // Force wrapper to full viewport using inline styles with !important
        wrapper.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          transform: none !important;
          margin: 0 !important;
          padding: 0 !important;
          width: ${viewportWidth}px !important;
          height: ${viewportHeight}px !important;
          min-width: ${viewportWidth}px !important;
          min-height: ${viewportHeight}px !important;
          max-width: ${viewportWidth}px !important;
          max-height: ${viewportHeight}px !important;
          z-index: 1 !important;
          pointer-events: none !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        `;
      }
      
      // Force canvas to full viewport size
      const canvas = gl.domElement;
      const canvasParent = canvas.parentElement;
      
      // Ensure parent container is full viewport
      if (canvasParent) {
        canvasParent.style.setProperty('width', `${viewportWidth}px`, 'important');
        canvasParent.style.setProperty('height', `${viewportHeight}px`, 'important');
        canvasParent.style.setProperty('position', 'relative', 'important');
        canvasParent.style.setProperty('display', 'block', 'important');
        canvasParent.style.setProperty('margin', '0', 'important');
        canvasParent.style.setProperty('padding', '0', 'important');
        canvasParent.style.setProperty('transform', 'none', 'important');
      }
      
      // Force canvas element itself to full viewport
      canvas.style.setProperty('width', `${viewportWidth}px`, 'important');
      canvas.style.setProperty('height', `${viewportHeight}px`, 'important');
      canvas.style.setProperty('display', 'block', 'important');
      canvas.style.setProperty('position', 'absolute', 'important');
      canvas.style.setProperty('top', '0', 'important');
      canvas.style.setProperty('left', '0', 'important');
      canvas.style.setProperty('margin', '0', 'important');
      canvas.style.setProperty('padding', '0', 'important');
      canvas.style.setProperty('transform', 'none', 'important');
      
      // CRITICAL: Set canvas pixel dimensions to match CSS display size exactly
      // This ensures 1:1 pixel rendering - no scaling!
      canvas.width = viewportWidth;
      canvas.height = viewportHeight;
      
      // Update renderer - use pixelRatio of 1 to match CSS size exactly
      gl.setSize(viewportWidth, viewportHeight, false); // false = don't let R3F update styles
      gl.setPixelRatio(1); // Use 1:1 ratio so pixel size = CSS size
      camera.aspect = viewportWidth / viewportHeight;
      // Ensure camera stays centered
      camera.position.set(0, 0, 40);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      
      // Verify the sizes match (only log on first resize to avoid spam)
      if (!(window as any).__morphingSceneResized) {
        const canvasComputed = window.getComputedStyle(canvas);
        const sizeMismatch = Math.abs(canvas.width - parseInt(canvasComputed.width)) > 5 || 
                            Math.abs(canvas.height - parseInt(canvasComputed.height)) > 5;
        
        if (sizeMismatch) {
          console.warn('⚠️ [ResizeHandler] Size mismatch detected!', {
            canvasPixelWidth: canvas.width,
            canvasPixelHeight: canvas.height,
            canvasCSSWidth: canvasComputed.width,
            canvasCSSHeight: canvasComputed.height,
            viewport: `${viewportWidth}x${viewportHeight}`,
          });
          // Force canvas pixel size to match CSS size
          canvas.width = parseInt(canvasComputed.width) || viewportWidth;
          canvas.height = parseInt(canvasComputed.height) || viewportHeight;
          gl.setSize(canvas.width, canvas.height, false);
          camera.aspect = canvas.width / canvas.height;
          // Ensure camera stays centered
          camera.position.set(0, 0, 40);
          camera.lookAt(0, 0, 0);
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
        } else {
          console.log('✅ [ResizeHandler] Canvas initialized:', {
            viewport: `${viewportWidth}x${viewportHeight}`,
            canvasPixel: `${canvas.width}x${canvas.height}`,
          });
        }
        (window as any).__morphingSceneResized = true;
      }
    };
    
    // Initial resize - only once after mount
    const initialTimeout = setTimeout(() => {
      handleResize();
    }, 100);
    
    // Listen for window resize
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      clearTimeout(initialTimeout);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [gl, camera]);
  
  return null;
}

// ---- Camera Controller ----
function CameraController() {
  const { camera, size } = useThree();
  useFrame(({ scene }) => {
    // Keep camera centered to show morphing particles in center
    // Ensure camera is always centered regardless of viewport size
    // CRITICAL: Lock camera position to prevent any movement
    if (camera.position.x !== 0 || camera.position.y !== 0 || camera.position.z !== 40) {
      camera.position.set(0, 0, 40);
    }
    camera.lookAt(0, 0, 0); // Always look at center
    // Update aspect ratio for extension popup (400px width) vs full screen
    // But ensure camera stays centered
    const newAspect = size.width / size.height;
    if (Math.abs(camera.aspect - newAspect) > 0.001) {
      camera.aspect = newAspect;
      camera.updateProjectionMatrix();
    }
    // Update camera matrix to ensure rendering
    camera.updateMatrixWorld();
    
    // Debug: Log camera position periodically to ensure it stays centered
    const time = performance.now();
    if (!(window as any).__lastCameraLog || time - (window as any).__lastCameraLog > 5000) {
      const pointsObjects = scene.children.filter(child => child.type === 'Points');
      if (pointsObjects.length > 0) {
        const firstPoints = pointsObjects[0] as THREE.Points;
        const geom = firstPoints.geometry;
        const posAttr = geom?.attributes?.position;
        if (posAttr && posAttr.count > 0) {
          const firstPos = new THREE.Vector3(
            posAttr.array[0],
            posAttr.array[1],
            posAttr.array[2]
          );
          const distance = camera.position.distanceTo(firstPos);
          // Debug logging removed for performance
          // console.log('🔍 [CameraController] Camera check:', {
          //   cameraPos: camera.position.toArray(),
          //   firstParticlePos: firstPos.toArray(),
          //   distance: distance.toFixed(2),
          //   aspect: camera.aspect.toFixed(2),
          //   fov: camera.fov
          // });
        }
      }
      (window as any).__lastCameraLog = time;
    }
  });
  return null;
}

// ---- Error Boundary ----
class SceneErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('❌ [MorphingScene] Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "radial-gradient(circle at 50% 40%, #261e35 0%, #1a1425 25%, #0f0a18 55%, #050203 80%, #000000 100%)",
              zIndex: 2,
              pointerEvents: "none",
              color: "#ff4444",
              fontSize: "14px",
            }}
          >
            3D background restarting...
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// ---- Scene ----
function MorphingScene() {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const contextLossCountRef = useRef(0);
  const contextLossTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Handle context loss with proper restoration (only reload after 3 consecutive losses)
  const handleContextLost = (event: WebGLContextEvent) => {
    event.preventDefault();
    contextLossCountRef.current += 1;
    console.warn(`🧯 [MorphingScene] WebGL context lost (count: ${contextLossCountRef.current}) — attempting to restore...`);
    
    // Clear any existing timer
    if (contextLossTimerRef.current) {
      clearTimeout(contextLossTimerRef.current);
    }
    
    // Attempt to force context restoration if available
    if (rendererRef.current && (rendererRef.current as any).forceContextRestore) {
      try {
        (rendererRef.current as any).forceContextRestore();
      } catch (error) {
        console.warn('⚠️ [MorphingScene] Could not force context restore:', error);
      }
    }
    
    // Reset counter after 5 seconds (if context is stable, reset the count)
    contextLossTimerRef.current = setTimeout(() => {
      if (contextLossCountRef.current > 0) {
        console.log(`✅ [MorphingScene] Context stable for 5s, resetting loss count from ${contextLossCountRef.current} to 0`);
        contextLossCountRef.current = 0;
      }
    }, 5000);
    
    // Only reload after 3 consecutive context losses
    if (contextLossCountRef.current >= 3) {
      console.error(`❌ [MorphingScene] WebGL context lost ${contextLossCountRef.current} times. Reloading page...`);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  const handleContextRestored = () => {
    console.info(`✅ [MorphingScene] WebGL context restored. (Previous loss count: ${contextLossCountRef.current})`);
    // Reset counter on successful restoration
    contextLossCountRef.current = 0;
    if (contextLossTimerRef.current) {
      clearTimeout(contextLossTimerRef.current);
      contextLossTimerRef.current = null;
    }
    // Context is restored, scene should reinitialize automatically
  };

  return (
    <>
      {/* Dark background layer - ensures no white shows through */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "#000000",
          zIndex: -2,
          pointerEvents: "none",
        }}
      />
      
      {/* Canvas wrapper with fixed positioning - ensures Canvas is visible */}
      <div
        id="morphing-scene-wrapper"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          zIndex: -1,
          pointerEvents: "none",
          margin: 0,
          padding: 0,
          overflow: "hidden",
          transform: "none", // Prevent any transforms from moving it
        }}
      >
        {/* Canvas with transparent WebGL - renders ABOVE dark background but BELOW UI content */}
        <SceneErrorBoundary fallback={<div className="text-red-400" style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>3D background restarting...</div>}>
          <Suspense fallback={null}>
            <Canvas
              camera={{ position: [0, 0, 40], fov: 80, near: 0.1, far: 2500 }}
              gl={{ 
                antialias: true, 
                alpha: true, 
                preserveDrawingBuffer: true,
                powerPreference: "high-performance",
                failIfMajorPerformanceCaveat: false,
              }}
              style={{ 
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                display: "block",
                background: "transparent",
                zIndex: 1,
                transform: "none", // Prevent any transforms from moving it
                margin: 0,
                padding: 0,
              }}
              frameloop="always"
              onCreated={({ gl, scene, camera }) => {
              // Store renderer reference for context restoration
              rendererRef.current = gl;
              
              // CRITICAL: Set camera position immediately and lock it to center
              camera.position.set(0, 0, 40);
              camera.lookAt(0, 0, 0);
              camera.updateMatrixWorld();
              
              // Set WebGL to clear with transparent alpha (fully transparent)
              gl.setClearColor(0x000000, 0);
              // Ensure renderer alpha is enabled and rendering works
              gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
              // Keep scene background null so it's fully transparent
              scene.background = null;
              
              // Set up WebGL context lost/restored handlers on the canvas element
              const canvas = gl.domElement;
              
              const contextLostHandler = (e: Event) => {
                const event = e as WebGLContextEvent;
                handleContextLost(event);
              };
              
              canvas.addEventListener('webglcontextlost', contextLostHandler, false);
              canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
              
              console.log('✅ [MorphingScene] Canvas created');
              console.log('✅ [MorphingScene] Renderer size:', gl.getSize(new THREE.Vector2()));
              console.log('✅ [MorphingScene] Camera position:', camera.position);
              console.log('✅ [MorphingScene] Scene children:', scene.children.length);
              
              // Force initial render to verify particles are visible
              setTimeout(() => {
                const pointsObjects = scene.children.filter(child => child.type === 'Points');
                console.log('✅ [MorphingScene] Points objects:', pointsObjects.length);
                pointsObjects.forEach((points, i) => {
                  const p = points as THREE.Points;
                  const geom = p.geometry;
                  const posAttr = geom?.attributes?.position;
                  const colorAttr = geom?.attributes?.color;
                  const sizeAttr = geom?.attributes?.size;
                  
                  // Sample first 3 vertices to check positions
                  const sampleVertices = [];
                  if (posAttr && posAttr.array) {
                    for (let j = 0; j < Math.min(3, posAttr.count); j++) {
                      const idx = j * 3;
                      sampleVertices.push([
                        posAttr.array[idx],
                        posAttr.array[idx + 1],
                        posAttr.array[idx + 2]
                      ]);
                    }
                  }
                  
                  // Debug logging removed for performance - uncomment if needed for debugging
                  // console.log(`  Points ${i}:`, { visible: p.visible, position: p.position.toArray(), ... });
                });
              }, 1000);
            }}
            onError={(error) => {
              console.error('❌ [MorphingScene] Canvas error:', error);
              // Don't crash the app - just log the error
            }}
            >
              <ResizeHandler />
              <CameraController />
              <Stars />
              <MorphingParticles />
            </Canvas>
          </Suspense>
        </SceneErrorBoundary>
      </div>
    </>
  );
}

// Export with React.memo to prevent unnecessary remounts
export default memo(MorphingScene);
