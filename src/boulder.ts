import * as d3 from "d3";
import Victor from "victor";
import { gaussianRandom, lerpVictor } from "./util";
import rough from 'roughjs';
const gen = rough.generator(
    {
        options: {
            roughness: 4,
            bowing: 3,
            fillStyle: 'solid',
            stroke: '#888888',
            strokeWidth: 0.5,
            disableMultiStroke: false
        }
    }
)
export function setupSVGContainer(container: HTMLElement) {
    const svg = d3
        .select(container)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%");

    return svg;
}
class Environment {
    elements: Element[] = [];
    bounds: DOMRect;
    constructor(public container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public wind: Victor = new Victor(20, 0)) {
        this.bounds = container.node()!.getBoundingClientRect();
        this.init();


    }
    // get elements() {
    //     return [...this.spores, ...this.flowers, ...this.hairy_trunks];
    // }
    // set elements(els: Element[]) {
    //     this.spores = els.filter((el): el is Spore => el.type === "spore");
    //     this.flowers = els.filter((el): el is BasicFlower => el.type === "flower");
    //     this.hairy_trunks = els.filter((el): el is HairyTrunk => el.type === "hairy_trunk");
    // }
    remove(el: Element) {
        el.remove();
        this.elements = this.elements.filter((e) => e !== el);
    }
    draw() {
        this.elements.forEach((el) => el.draw(this));
    }
    tick() {
        this.elements.forEach((el) => el.tick(this, 1 / 60));
        let to_remove = this.elements.filter((el) => el.pos.x < 0 || el.pos.x > this.bounds.width || el.pos.y < 0 || el.pos.y > this.bounds.height);
        to_remove.forEach((el) => {
            el.remove();
        });
        this.elements = this.elements.filter((el) => !to_remove.includes(el));
    }
    init() {
        let peg_spacing = 75
        let width = this.bounds.width;
        let height = this.bounds.height;
        let x_count = Math.ceil(width / peg_spacing);
        let y_count = Math.ceil(height / peg_spacing);

        let offset_x = (width - (x_count - 1) * peg_spacing) / 2;
        let offset_y = (height - (y_count - 1) * peg_spacing) / 2;
        let holds = [] as { pos: Victor, hold: BoulderHold | null }[][];
        for (let i = 0; i < x_count; i++) {
            let holes_row = []
            for (let j = 0; j < y_count; j++) {
                let x = offset_x + i * peg_spacing;
                let y = offset_y + j * peg_spacing;
                let peg = new Peg(this.container, new Victor(x, y), 10);
                this.elements.push(peg);
                holes_row.push({ pos: new Victor(x, y), hold: null });
            }
            holds.push(holes_row);
        }
        let min_distance_between_holds = 3;
        for (let i = 0; i < x_count; i++) {
            for (let j = 0; j < y_count; j++) {
                let closest_other_hold_distance = Infinity;
                let current_hold = holds[i]![j];
                if (!current_hold) {
                    continue;
                }
                if (Math.random() < 0.7) {
                    continue
                }
                for (let ii = -min_distance_between_holds; ii <= min_distance_between_holds; ii++) {
                    for (let jj = -min_distance_between_holds; jj <= min_distance_between_holds; jj++) {
                        let ni = i + ii;
                        let nj = j + jj;
                        if (ni >= 0 && ni < x_count && nj >= 0 && nj < y_count) {
                            if (holds[ni]![nj]!.hold !== null) {
                                let dist = Math.abs(ii) + Math.abs(jj);
                                if (dist < closest_other_hold_distance) {
                                    closest_other_hold_distance = dist;
                                }
                            }
                        }
                    }
                }
                console.log(closest_other_hold_distance);
                if (closest_other_hold_distance < min_distance_between_holds) {
                    continue;
                }

                let boulder_hold = new BoulderHold(this, new Victor(current_hold.pos.x, current_hold.pos.y),
                    this.container,
                    20 + Math.random() * 5, 30 + Math.random() * 30);
                this.elements.push(boulder_hold);
                holds[i]![j]!.hold = boulder_hold;
            }
        }
    }
}
interface Element {
    draw(env: Environment): void;
    tick(env: Environment, step: number): void;
    remove(): void;
    get pos(): Victor;
    get type(): string;
}
const container = setupSVGContainer(document.getElementById("full_page")!);
class Peg implements Element {
    static id_cnt: number = 0;
    id: number = 1;
    constructor(public container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public pos: Victor = new Victor(0, 0), public radius: number = 4) {
        this.id = Peg.id_cnt++;
        this.pos = pos;
    }
    get type(): string {
        return "peg";
    }
    tick(env: Environment, step: number): void {
    }
    remove() {
        this.container.selectAll<SVGGElement, unknown>(`#peg_${this.id}`).remove();
    }
    draw(env: Environment) {
        if (this.radius <= 2) {
            this.remove();
            env.remove(this);
            return;
        }
        let core_spore = this.container
            .selectAll<SVGGElement, unknown>(`#peg_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `peg_${this.id}`);
        const outer_circle_path = gen.circle(this.pos.x, this.pos.y, (this.radius), {
            fill: '#none',
            fillStyle: 'solid',
            hachureAngle: 10,
            hachureGap: 8,
            stroke: '#3e3e3e',
            seed: this.id + 4,
            roughness: 0.5
        });
        let outer_paths = gen.toPaths(outer_circle_path);

        let outer_circle = core_spore
            .selectAll<SVGCircleElement, unknown>(`#outer_circle_${this.id}`)
            .data(outer_paths)
            .join("path")
            .attr("id", `outer_circle_${this.id}`)
            .attr("d", d => d.d)
            .attr("fill", d => d.fill || "none")
            .attr("stroke", d => d.stroke || "none");
    }
}
class BoulderHold implements Element {
    get type(): string {
        return "boulder_hold";
    }
    cps: Victor[] = [];
    id: number = 0;
    static id_cnt: number = 0;
    delaunay: d3.Delaunay<Victor>;
    holes: Victor[] = [];
    first_draw: boolean = true;
    has_changed: boolean = false;
    constructor(public env: Environment, public pos: Victor, public container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public radius: number = 100, public radius_variation: number = 50) {
        this.id = BoulderHold.id_cnt++;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
            let cp = this.pos.clone().add(new Victor(Math.cos(angle), Math.sin(angle)).multiplyScalar(radius + (Math.random() - 0.5) * radius_variation));
            this.cps.push(cp);
        }
        // skew points to have a elongated shape
        let skew = new Victor(1.5, 1);
        let rotation = Math.random() * Math.PI * 2;
        for (let i = 0; i < this.cps.length; i++) {
            let cp = this.cps[i]!;
            cp = cp.subtract(this.pos).multiply(skew).add(this.pos);
            this.cps[i] = cp;

            // rotate points around center
            let angle_to_center = Math.atan2(cp.y - this.pos.y, cp.x - this.pos.x);
            let distance_to_center = cp.distance(this.pos);
            angle_to_center += rotation;
            cp = this.pos.clone().add(new Victor(Math.cos(angle_to_center), Math.sin(angle_to_center)).multiplyScalar(distance_to_center));
            this.cps[i] = cp;
        }

        let sampled_points: Victor[] = [];
        let num_samples = 100;
        for (let i = 0; i < num_samples; i++) {
            // sample points between center and control point + small random offset

            let t = i / num_samples * this.cps.length;
            let cp_index = Math.floor(t);
            let next_cp_index = (cp_index + 1) % this.cps.length;
            let local_t = t - cp_index;
            let point_on_edge = lerpVictor(this.cps[cp_index]!, this.cps[next_cp_index]!, local_t);
            let random_offset = new Victor((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
            let sampled_point = this.pos.clone().add(point_on_edge.subtract(this.pos).multiplyScalar(Math.random())).add(random_offset);
            sampled_points.push(sampled_point);
        }

        this.delaunay = new d3.Delaunay(sampled_points.flatMap(p => [p.x, p.y]));

        // find the hull of the points
        const hullPoints: Victor[] = [];
        for (const index of this.delaunay.hull) {
            hullPoints.push(sampled_points[index]!);
        }

        this.cps = hullPoints;


    }
    draw(env: Environment): void {
        if (this.first_draw || this.has_changed) {
            this.first_draw = false;
            this.has_changed = false;
        }
        let hold_group = this.container
            .selectAll<SVGGElement, unknown>(`#lotus_flower_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `lotus_flower_${this.id}`);
        let flower_path = d3.line<Victor>()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveCatmullRomClosed.alpha(0.5))(this.cps)!

        let color = d3.schemeCategory10[this.id % 5] || "#ff0000";
        let border = d3.color(color)!.darker(2).toString();
        let hold_gen = gen.path(flower_path,
            {
                roughness: 0.4,
                bowing: 1,
                seed: this.id * 30 || 1,
                stroke: border,
                strokeWidth: 4,
                fill: color,
            }
        )
        let flower_paths = gen.toPaths(hold_gen);
        hold_group
            .selectAll<SVGPathElement, unknown>(`#lotus_flower_path_${this.id}`)
            .data(flower_paths)
            .join("path")
            .attr("id", `lotus_flower_path_${this.id}`)
            .attr("d", d => d.d)
            .attr("stroke", d => d.stroke)
            .attr("stroke-width", d => d.strokeWidth)
            .attr("fill", d => d.fill || "none");

        // lotus_flower.selectAll<SVGPathElement, unknown>(`#lotus_flower_delaunay_${this.id}`)
        //     .data([this.id])
        //     .join("path")
        //     .attr("id", `lotus_flower_delaunay_${this.id}`)
        //     .attr("d", () => {
        //         return this.delaunay.render();
        //     })
        //     .attr("stroke", "#00000033")
        //     .attr("stroke-width", 1)
        //     .attr("fill", "none");
        // draw hole in center

        let hole_gen = gen.circle(this.pos.x, this.pos.y, 10, {
            roughness: 0.4,
            bowing: 1,
            seed: this.id * 50 || 1,
            stroke: "#000000",
            strokeWidth: 2,
            fill: "#a7a6a6",
        });
        let hole_paths = gen.toPaths(hole_gen);
        hold_group
            .selectAll<SVGPathElement, unknown>(`#lotus_flower_hole_${this.id}`)
            .data(hole_paths)
            .join("path")
            .attr("id", `lotus_flower_hole_${this.id}`)
            .attr("d", d => d.d)
            .attr("stroke", d => d.stroke)
            .attr("stroke-width", d => d.strokeWidth)
            .attr("fill", d => d.fill || "none");
    }
    tick(env: Environment, step: number): void {
    }
    remove(): void {
        this.container.selectAll<SVGGElement, unknown>(`#lotus_flower_${this.id}`).remove();
    }
}


const env = new Environment(container);

setInterval(() => {
    env.tick();
    env.draw();
}, 1000 / 60);


document.getElementById("download_svg")?.addEventListener("click", () => {
    const svgElement = env.container.node();
    if (svgElement) {
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "boulder.svg";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
});