declare module 'threejs-components/build/backgrounds/liquid1.min.js' {
  export interface LiquidApp {
    loadImage(url: string): void;
    setRain(on: boolean): void;
    dispose?: () => void;
    liquidPlane: { material: { metalness: number; roughness: number }; uniforms: { displacementScale: { value: number } } };
  }
  const LiquidBackground: (canvas: HTMLCanvasElement) => LiquidApp;
  export default LiquidBackground;
}
