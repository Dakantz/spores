import * as d3 from "d3";
import Victor from "victor";
import { gaussianRandom, lerpVictor } from "./util";
export function setupSVGContainer(container: HTMLElement) {
    const svg = d3
        .select(container)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%");

    return svg;
}
class Environment {
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    time: number;
    points: Victor[];
    constructor(container: HTMLElement) {
        this.svg = setupSVGContainer(container);
        this.time = 0;
        this.points = [];
        for (let i = 0; i < 10; i++) {
            this.points.push(new Victor(gaussianRandom(0, 100), gaussianRandom(0, 100)));
        }
    }
    tick() {
        this.time += 0.016;
    }
    draw() {
    }
}
class StackFrame {
    constructor(public x: number, public y: number, public angle: number, public length: number, public thickness:number) {

    }
}
class Stack{
    frames: StackFrame[];
    constructor() {
        this.frames = [];
    }
    push(frame: StackFrame) {
        this.frames.push(frame);
    }
    pop(): StackFrame | undefined {
        return this.frames.pop();
    }
}
class LTree {
    constructor(public start: string, public rules: Record<string, string>, public angle: number, public iterations: number, public length: number, public decayFactor = 0.7, public thickness = 4) {

    }
    generate(): string {
        let current = this.start;
        for (let i = 0; i < this.iterations; i++) {
            let next = "";
            for (const char of current) {
                if (this.rules[char]) {
                    next += this.rules[char];
                } else {
                    next += char;
                }
            }
            current = next;
        }
        return current;
    }
    draw(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, startX: number, startY: number) {
        const path = this.generate();
        console.log("Generated path:", path);
        const stack = new Stack();
        let x = startX;
        let y = startY;
        let thickness = this.thickness;
        let length = this.length;
        let currentAngle = -90; // Start pointing upwards
        stack.push(new StackFrame(x, y, currentAngle, length, thickness));
        const lineData: { x1: number; y1: number; x2: number; y2: number, thickness: number }[] = [];

        for (const char of path) {
            if (char === "L") {
                const rad = (currentAngle * Math.PI) / 180;
                const newX = x + length * Math.cos(rad);
                const newY = y + length * Math.sin(rad);
                lineData.push({ x1: x, y1: y, x2: newX, y2: newY , thickness: thickness });
                x = newX;
                y = newY;
            } else if (char === "+") {
                currentAngle += this.angle;
            } else if (char === "-") {
                currentAngle -= this.angle;
            } else if (char === "[") {
                stack.push(new StackFrame(x, y, currentAngle, length, thickness));
                length *= this.decayFactor;
                // thickness *= this.decayFactor;
            } else if (char === "]") {
                const state = stack.pop();
                if (state) {
                    x = state.x;
                    y = state.y;
                    currentAngle = state.angle;
                    length = state.length;
                    thickness = state.thickness;
                }
            }
        }

        svg.selectAll("line")
            .data(lineData)
            .join("line")
            .attr("x1", d => d.x1)
            .attr("y1", d => d.y1)
            .attr("x2", d => d.x2)
            .attr("y2", d => d.y2)
            .attr("stroke", "black")
            .attr("stroke-width", d => d.thickness);
    }
}

let ltree_tree = new LTree("F", {
    "F": "L-[F]++[F]"
}, 45, 8, 100, 0.57);



const container = document.getElementById("full_page");
if (!container) {
    throw new Error("Container element not found");
}
const env = new Environment(container);

document.getElementById("download_svg")?.addEventListener("click", () => {
    const svgElement = env.svg.node();
    if (svgElement) {
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "ltree.svg";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
});

ltree_tree.draw(env.svg, 300, 600);
setInterval(() => {
    env.tick();
    env.draw();
}, 1000 / 60);
