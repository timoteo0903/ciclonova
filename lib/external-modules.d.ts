declare module "html2canvas" {
  export default function html2canvas(
    element: HTMLElement,
    options?: Record<string, unknown>,
  ): Promise<HTMLCanvasElement>;
}

declare module "jspdf" {
  export class jsPDF {
    constructor(options?: Record<string, unknown>);
    internal: {
      pageSize: {
        getWidth(): number;
        getHeight(): number;
      };
    };
    setFont(fontName: string, fontStyle?: string): void;
    setFontSize(size: number): void;
    setTextColor(r: number, g: number, b: number): void;
    text(text: string, x: number, y: number): void;
    addImage(
      imageData: string,
      format: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ): void;
    save(filename: string): void;
  }
}
