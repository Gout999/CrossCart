'use client';

import Image from 'next/image';
import { useRef } from 'react';

export function ConsentArt({ showDemoQuote }: { showDemoQuote: boolean }) {
  const scene = useRef<HTMLDivElement>(null);
  return <figure className="consent-art" ref={scene} onPointerMove={event => {
    if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    scene.current?.style.setProperty('--tilt-x', `${(event.clientY - bounds.top - bounds.height / 2) / bounds.height * -2}deg`);
    scene.current?.style.setProperty('--tilt-y', `${(event.clientX - bounds.left - bounds.width / 2) / bounds.width * 2}deg`);
  }} onPointerLeave={() => {
    scene.current?.style.setProperty('--tilt-x', '0deg');
    scene.current?.style.setProperty('--tilt-y', '0deg');
  }}>
    <Image src={showDemoQuote ? '/consent-demo-a.webp' : '/consent-paper.webp'} alt="Illustration of three paper merchant quotes becoming one exact purchase to review. This illustration is not an approval or transaction record." width={760} height={1000} sizes="(max-width: 700px) 180px, (max-width: 1000px) 34vw, (min-width: 1600px) 680px, 43vw" preload />
    <figcaption>Your budget is a limit.<br/><em>Your approval is exact.</em><small>Illustrative demo quotes</small></figcaption>
  </figure>;
}
