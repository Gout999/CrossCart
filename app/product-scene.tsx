'use client';

import Image from 'next/image';
import { useRef } from 'react';

export function ProductScene() {
  const scene = useRef<HTMLDivElement>(null);
  return <div className="product-scene" ref={scene} onPointerMove={event => {
    if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    scene.current?.style.setProperty('--tilt-x', `${(event.clientY - bounds.top - bounds.height / 2) / bounds.height * -7}deg`);
    scene.current?.style.setProperty('--tilt-y', `${(event.clientX - bounds.left - bounds.width / 2) / bounds.width * 9}deg`);
  }} onPointerLeave={() => {
    scene.current?.style.setProperty('--tilt-x', '0deg');
    scene.current?.style.setProperty('--tilt-y', '0deg');
  }}>
    <div className="product-halo" aria-hidden="true" />
    <div className="product-image"><Image src="/crosscart-headphones.webp" alt="Original concept image of graphite wireless headphones. Actual product and merchant data in this demo are synthetic." width={960} height={960} sizes="(max-width: 600px) 225px, (max-width: 900px) 245px, (max-width: 1100px) 275px, (min-width: 1600px) 355px, 325px" preload /></div>
    <span className="product-caption">DEMO WIRELESS HEADPHONES<span>Original concept visual</span></span>
  </div>;
}
