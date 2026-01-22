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
        let hill_cnt = 10;
        for (let i = 0; i < hill_cnt; i++) {
            let hill = new HillyBackground(this.container, this.bounds.width, this.bounds.height / 2 + (this.bounds.height / hill_cnt) * i, 5 + i * 3);
            this.elements.push(hill);
            hill.cps.forEach((cp) => {
                if (Math.random() < 0.3) {
                    this.elements.push(new BasicFlower(this.container, cp.clone(), 20 / (1 - cp.y / this.bounds.height)));
                }
            });
        }

        for (let i = 0; i < 6; i++) {
            let side = Math.random() < 0.5 ? 0 : 1;
            let xpos = Math.max(0, Math.min(this.bounds.width, gaussianRandom() * this.bounds.width * 0.06 + side * this.bounds.width));
            this.elements.push(new TreeTrunk(xpos, this.container, 100 + Math.random() * 50));
        }
        let trunk_num = 10;
        for (let i = 0; i < 10; i++) {
            this.elements.push(new Spore(this.container, new Victor(Math.random() * this.bounds.width, Math.random() * this.bounds.height), 5 + Math.random() * 3));
        }
        // for (let i = 0; i < 20; i++) {
        //     this.elements.push(new BasicFlower(this.container, new Victor(Math.random() * this.bounds.width, this.bounds.height - Math.abs(gaussianRandom()) * this.bounds.height * 0.2)));
        // }
        let flowers = Array.from({ length: 15 }, () => { return { radius: 800 + Math.random() * 50, radius_variation: 20 + Math.random() * 10, x: 0, y: 0 }; });
        let root = { radius: 800, radius_variation: 50, children: flowers };
        let hier = d3.hierarchy(root).sum(d => d.radius + (d.radius_variation || 0));
        let width = this.bounds.width;
        let height = this.bounds.height;
        let padding = 50;
        var nodes = d3.pack()
            .padding(padding)
            .size([width, height / 1.5])
            (hier as any)
            .descendants();
        for (let node of nodes) {
            if (node.depth === 0) continue;
            node.y += height / 4;
            let radius = node.r * node.y / height;
            let flower = new LotusHoleFlower(this, new Victor(node.x + Math.random() * padding, node.y + Math.random() * padding), this.container, radius, radius * 0.2);
            this.elements.push(flower);
            for (let hole of flower.holes) {
                if (Math.random() < 0.3) {
                    this.elements.push(new BasicFlower(this.container, hole.clone(), radius * 0.8));
                }
            }
        }
        let hairy_trunks = [];
        for (let i = 0; i < trunk_num; i++) {
            let side = Math.random() < 0.5 ? 0 : 1;
            let xpos = Math.max(0, Math.min(this.bounds.width, gaussianRandom() * this.bounds.width * 0.1 + side * this.bounds.width));
            hairy_trunks.push(new HairyTrunk(new Victor(xpos, this.bounds.height - Math.abs(gaussianRandom()) * this.bounds.height * 0.1), this.container, 40 + Math.random() * 30));
        }
        let front_hill = new HillyBackground(this.container, this.bounds.width, this.bounds.height, 20);
        let hairy_trunk_positions = hairy_trunks.map(trunk => trunk.pos);
        hairy_trunk_positions.sort((a, b) => a.x - b.x);
        front_hill.cps = hairy_trunk_positions
        this.elements.push(front_hill);
        this.elements.push(...hairy_trunks);

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
class Spore implements Element {
    static id_cnt: number = 0;
    id: number = 0;
    velocity: Victor = new Victor(0, 0);
    acceleration: Victor = new Victor(0, 0);
    initial_radius: number = 4;
    breeze_dir: number = 0;
    constructor(public container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public pos: Victor = new Victor(0, 0), public radius: number = 4, public noise_scale: number = 40) {
        this.id = Spore.id_cnt++;
        this.initial_radius = radius;
        this.breeze_dir = Math.random() * Math.PI * 2;
    }
    get type(): string {
        return "spore";
    }
    tick(env: Environment, step: number): void {
        // interpolate velocity towards wind
        this.acceleration = env.wind.clone().subtract(this.velocity).multiplyScalar(0.1);

        this.acceleration.add(new Victor(Math.cos(this.breeze_dir), Math.sin(this.breeze_dir)).multiplyScalar(this.noise_scale));

        this.breeze_dir += (Math.sin(Date.now() / 1000 + this.id)) * 0.04;

        this.velocity.add(this.acceleration.clone().multiplyScalar(step));

        this.pos.add(this.velocity.clone().multiplyScalar(step));

        this.radius += (Math.sin(Date.now() / 500 + this.breeze_dir)) * 0.04;
        this.radius = Math.min(Math.max(this.radius, this.initial_radius - 5), this.initial_radius + 5);
        if (this.radius < 1) {
            env.remove(this);
        }
    }
    remove() {
        this.container.selectAll<SVGGElement, unknown>(`#spore_${this.id}`).remove();
    }
    draw(env: Environment) {
        if (this.radius <= 2) {
            this.remove();
            env.remove(this);
            return;
        }
        let core_spore = this.container
            .selectAll<SVGGElement, unknown>(`#spore_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `spore_${this.id}`);

        gen.circle(this.pos.x, this.pos.y, (this.radius + 5) * 2, {
            fill: '#B0DADE',
            fillStyle: 'solid',
            hachureAngle: 60,
            hachureGap: 8,
            stroke: '#B0DADE',
            strokeWidth: 1.5
        });
        const outer_circle_path = gen.circle(this.pos.x, this.pos.y, (this.radius + 5) * 2, {
            fill: '#B0DADE',
            fillStyle: 'solid',
            hachureAngle: 60,
            hachureGap: 8,
            stroke: '#B0DADE',
            seed: this.id || 1
        });
        const middle_circle_path = gen.circle(this.pos.x, this.pos.y, this.radius * 2, {
            fill: '#e2e2e2',
            fillStyle: 'solid',
            hachureAngle: -60,
            hachureGap: 6,
            stroke: '#e2e2e2',
            seed: this.id
        })
        let outer_paths = gen.toPaths(outer_circle_path);
        let middle_paths = gen.toPaths(middle_circle_path);

        let outer_circle = core_spore
            .selectAll<SVGCircleElement, unknown>(`#outer_circle_${this.id}`)
            .data(outer_paths)
            .join("path")
            .attr("id", `outer_circle_${this.id}`)
            .attr("d", d => d.d)
            .attr("fill", "#B0DADE");
        let middle_circle = core_spore
            .selectAll<SVGCircleElement, unknown>(`#middle_circle_${this.id}`)
            .data(middle_paths)
            .join("path")
            .attr("id", `middle_circle_${this.id}`)
            .attr("d", d => d.d)
            .attr("fill", "#e2e2e2");
    }
}

class Petal implements Element {
    static id_cnt: number = 0;
    id: number = 0;
    constructor(public start: Victor, public end: Victor, private container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public angle: number = 0) {
        this.id = Petal.id_cnt++;
    }
    draw(env: Environment): void {
        let petal_group = this.container
            .selectAll<SVGGElement, unknown>(`#petal_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `petal_${this.id}`);

        let petal_path = petal_group
            .selectAll<SVGPathElement, unknown>(`#petal_path_${this.id}`)
            .data([this.id])
            .join("path")
            .attr("id", `petal_path_${this.id}`)
            .attr("d", () => {
                let current_angle = Math.atan2(this.end.y - this.start.y, this.end.x - this.start.x);
                let length = this.start.distance(this.end);

                let control_point1 = this.start.clone().add(new Victor(Math.cos(current_angle + this.angle), Math.sin(current_angle + this.angle)).multiplyScalar(length / 2));
                let control_point2 = this.end.clone().add(new Victor(Math.cos(current_angle - this.angle), Math.sin(current_angle - this.angle)).multiplyScalar(-length / 2));

                return `M ${this.start.x} ${this.start.y} C ${control_point1.x} ${control_point1.y}, ${control_point2.x} ${control_point2.y}, ${this.end.x} ${this.end.y} Z`;
            }).attr("fill", "#514834")
    }
    tick(env: Environment, step: number): void {
    }
    remove(): void {
        this.container.selectAll<SVGGElement, unknown>(`#petal_${this.id}`).remove();
    }
    get pos(): Victor {
        return this.start.clone().add(this.end).multiplyScalar(0.5);
    }
    get type(): string {
        return "petal";
    }
}
class BasicFlower implements Element {
    static id_cnt: number = 0;
    id: number = 0;
    control_points: Victor[] = [];
    petals: Petal[] = [];
    has_changed: boolean = true;
    constructor(private container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public pos: Victor = new Victor(0, 0),
        control_points_dist = 100, control_points_num = 3, control_points_spread = Math.PI / 2, control_points_decay = 0.5,
        petal_layers = 5, petals_per_layer = 8) {
        this.id = BasicFlower.id_cnt++;
        let control_point_angle = -Math.PI / 2;
        let control_point_dir = Math.random() < 0.5 ? -1 : 1;
        let control_point_dist_dec = control_points_dist;
        this.control_points = [this.pos.clone()];
        for (let i = 0; i < control_points_num; i++) {

            let cp = this.control_points[this.control_points.length - 1]!
                .clone()
                .add(new Victor(Math.cos(control_point_angle), Math.sin(control_point_angle)).multiplyScalar(control_point_dist_dec));
            this.control_points.push(cp);
            control_point_angle += control_point_dir * (Math.random() + 0.3) * control_points_spread;
            console.log("Angle,", control_point_angle * 180 / Math.PI);
            control_points_spread = control_points_spread * 0.5;
            // control_point_angle = Math.max(Math.min(control_point_angle, -Math.PI / 2 - Math.PI / 8), -Math.PI / 2 + Math.PI / 8);
            control_point_dist_dec *= control_points_decay;
        }
        let last_cp = this.control_points[this.control_points.length - 1]!;
        for (let layer = 0; layer < petal_layers; layer++) {
            let layer_radius = 2 * control_point_dist_dec * (1 - layer / petal_layers);
            for (let p = 0; p < petals_per_layer; p++) {
                let angle = (p / petals_per_layer) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / petals_per_layer);
                let petal_length = layer_radius * (0.7 + Math.random() * 0.3);
                let petal_start = last_cp;
                let petal_end = last_cp.clone().add(new Victor(Math.cos(angle), Math.sin(angle)).multiplyScalar(petal_length));
                let petal = new Petal(petal_start, petal_end, this.container, Math.PI / 8);
                this.petals.push(petal);
            }
        }

    }
    get type(): string {
        return "flower";
    }
    tick(env: Environment, step: number): void {
        // produce a new spore at the end of the petal occasionally
        if (Math.random() < 0.001) {
            env.elements.push(new Spore(env.container, this.control_points[this.control_points.length - 1]!.clone(), 3 + Math.random() * 2));
        }
        this.petals.forEach((petal) => petal.tick(env, step));
    }
    remove() {
        this.container.selectAll<SVGGElement, unknown>(`#flower_${this.id}`).remove();
        this.petals.forEach((petal) => petal.remove());
    }
    draw(env: Environment) {
        if (this.has_changed) {
            this.has_changed = false;
            return
        }
        let core_flower = this.container
            .selectAll<SVGGElement, unknown>(`#flower_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `flower_${this.id}`);
        for (let petal of this.petals) {
            petal.draw(env)
        }
        for (let cp of this.control_points) {
            let cp_circle = core_flower
                .selectAll<SVGCircleElement, unknown>(`#cp_circle_${this.id}_${this.control_points.indexOf(cp)}`)
                .data([this.id])
                .join("circle")
                .attr("id", `cp_circle_${this.id}_${this.control_points.indexOf(cp)}`)
                .attr("cx", cp.x)
                .attr("cy", cp.y)
                .attr("r", 4)
                .attr("fill", "#44482e");
        }
        let line_generator = d3.line<Victor>()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveCatmullRom.alpha(0.5));
        let stem_path = line_generator(this.control_points);
        let stem_gen = gen.linearPath(this.control_points.map(p => [p.x, p.y]), {
            bowing: 2,

            hachureAngle: 90,
            seed: this.id * 10 || 1,
            stroke: '#766642',
            strokeWidth: 2,
        })
        let stem_paths = gen.toPaths(stem_gen);
        let stem = core_flower
            .selectAll<SVGPathElement, unknown>(`#stem_${this.id}`)
            .data(stem_paths)
            .join("path")
            .attr("id", `stem_${this.id}`)
            .attr("d", (d) => d.d)
            .attr("stroke", d => d.stroke)
            .attr("stroke-width", d => d.strokeWidth)
            .attr("fill", d => d.fill || "none");
    }
}
// Hairy Hills also producing spores

class HairyTrunk implements Element {
    get type(): string {
        return "hairy_trunk";
    }
    static id_cnt: number = 0;
    id: number = 0;

    control_points: Victor[] = [];
    trunk_thicknesses: number[] = [];
    angles: number[] = [];
    petals: Petal[] = [];
    delaunay: d3.Delaunay<Victor>;
    get all_points(): Victor[] {
        let left_side_points: Victor[] = [];
        let right_side_points: Victor[] = [];
        for (let i = 0; i < this.control_points.length; i++) {
            let cp = this.control_points[i]!;
            let angle = (this.angles[i] || 0) + Math.PI / 2;
            let thickness = this.trunk_thicknesses[i] || 200;
            let left_point = cp.clone().add(new Victor(Math.cos(angle), Math.sin(angle)).multiplyScalar(thickness / 2));
            let right_point = cp.clone().add(new Victor(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI)).multiplyScalar(thickness / 2));
            left_side_points.push(left_point);
            right_side_points.push(right_point);
        }
        left_side_points.push(...right_side_points.reverse(), left_side_points[0]!);
        return left_side_points;
    }
    constructor(public pos: Victor, public container: d3.Selection<SVGSVGElement, unknown, null, undefined>, width: number = 75) {
        this.id = HairyTrunk.id_cnt++;
        // control points for the trunk

        let control_point_angle = -Math.PI / 2;
        let control_point_dir = Math.random() < 0.5 ? -1 : 1;
        let control_points_spread = Math.PI / 4;
        let control_points_decay = 0.9;
        let control_point_dist_dec = 100;
        let trunk_thickness = width;
        this.control_points = [this.pos.clone()];
        this.trunk_thicknesses = [trunk_thickness];
        this.angles = [control_point_angle];
        for (let i = 0; i < 6; i++) {

            let cp = this.control_points[this.control_points.length - 1]!
                .clone()
                .add(new Victor(Math.cos(control_point_angle), Math.sin(control_point_angle)).multiplyScalar(control_point_dist_dec));
            this.control_points.push(cp);
            this.trunk_thicknesses.push(trunk_thickness);
            this.angles.push(control_point_angle);
            control_point_angle += control_point_dir * (Math.random() + 0.3) * (control_points_spread);
            console.log("Angle,", control_point_angle * 180 / Math.PI);
            console.log("CP,", cp);
            console.log("Thickness,", trunk_thickness, this.trunk_thicknesses);
            control_points_spread = control_points_spread * 0.5;
            // control_point_angle = Math.max(Math.min(control_point_angle, -Math.PI / 2 - Math.PI / 8), -Math.PI / 2 + Math.PI / 8);
            control_point_dist_dec *= control_points_decay;
            trunk_thickness = trunk_thickness + Math.random() * trunk_thickness * 0.1;
            // add gradient to svg
        }

        this.delaunay = d3.Delaunay.from(this.all_points, d => d.x, d => d.y);

        container.
            append("defs")
            .append("linearGradient")
            .attr("id", `trunk_gradient_${this.id}`)
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "0%")
            .attr("y2", "100%")
            .selectAll("stop")
            .data([
                { offset: "0%", color: "#44545E" },
                { offset: "100%", color: "#758384" }
            ])
            .enter()
            .append("stop")
            .attr("offset", d => d.offset)
            .attr("stop-color", d => d.color);

    }
    draw(env: Environment): void {
        let hairy_trunk = this.container
            .selectAll<SVGGElement, unknown>(`#hairy_trunk_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `hairy_trunk_${this.id}`);
        // for (let control_point of this.control_points) {
        //     let cp_circle = hairy_trunk
        //         .selectAll<SVGCircleElement, unknown>(`#trunk_cp_circle_${this.id}_${this.control_points.indexOf(control_point)}`)
        //         .data([this.id])
        //         .join("circle")
        //         .attr("id", `trunk_cp_circle_${this.id}_${this.control_points.indexOf(control_point)}`)
        //         .attr("cx", control_point.x)
        //         .attr("cy", control_point.y)
        //         .attr("r", 3)
        //         .attr("fill", "#333F45");
        // }
        let trunk_path = d3.line<Victor>()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveCatmullRomClosed.alpha(0.2))(this.all_points)!;
        let trunk_gen = gen.path(trunk_path,
            {
                seed: this.id * 20 || 1,
                stroke: '#333F45',
                strokeWidth: 2,
                fill: `url(#trunk_gradient_${this.id})`,
            }
        )
        let trunk_paths = gen.toPaths(trunk_gen);
        hairy_trunk
            .selectAll<SVGPathElement, unknown>(`#trunk_path_${this.id}`)
            .data(trunk_paths)
            .join("path")
            .attr("id", `trunk_path_${this.id}`)
            .attr("d", d => d.d)
            .attr("stroke", d => d.stroke)
            .attr("stroke-width", d => d.strokeWidth)
            .attr("fill", d => d.fill || "none");

    }
    tick(env: Environment, step: number): void {
        // produce spores
    }
    remove(): void {
        this.container.selectAll<SVGGElement, unknown>(`#hairy_trunk_${this.id}`).remove();
    }
}

// lotus flowers

class LotusHoleFlower implements Element {
    get type(): string {
        return "lotus_hole_flower";
    }
    cps: Victor[] = [];
    id: number = 0;
    static id_cnt: number = 0;
    delaunay: d3.Delaunay<Victor>;
    holes: Victor[] = [];
    first_draw: boolean = true;
    has_changed: boolean = false;
    constructor(public env: Environment, public pos: Victor, public container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public radius: number = 100, public radius_variation: number = 50) {
        this.id = LotusHoleFlower.id_cnt++;
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

        // find the points (holes) that are at least 1 hop away from the hull + are at least one hop from other holes and add them as holes

        let non_hull_indices = new Set<number>();
        for (let i = 0; i < sampled_points.length; i++) {
            if (!this.delaunay.hull.includes(i)) {
                non_hull_indices.add(i);
            }
        }
        let holes: Victor[] = [];
        let hole_indices: Set<number> = new Set();
        for (let index of non_hull_indices) {
            let neighbors = this.delaunay.neighbors(index);
            let is_far_from_hull = true;
            for (let neighbor of neighbors) {
                if (this.delaunay.hull.includes(neighbor)) {
                    is_far_from_hull = false;
                    break;
                }
            }
            if (is_far_from_hull) {
                let hole_point = sampled_points[index]!;
                let is_far_from_other_holes = true;
                let hole_candidate_neighbors = this.delaunay.neighbors(index);
                for (let neighbor of hole_candidate_neighbors) {
                    for (let hole_index of hole_indices) {
                        let hole_point_existing_neghbors = [...this.delaunay.neighbors(hole_index)];
                        if (hole_point_existing_neghbors.includes(neighbor)) {
                            is_far_from_other_holes = false;
                            break;
                        }
                    }
                }
                if (is_far_from_other_holes) {
                    holes.push(hole_point);
                    hole_indices.add(index);
                }
            }
        }
        this.holes = holes;

    }
    draw(env: Environment): void {
        if (this.first_draw || this.has_changed) {
            this.first_draw = false;
            this.has_changed = false;
        }
        let lotus_flower = this.container
            .selectAll<SVGGElement, unknown>(`#lotus_flower_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `lotus_flower_${this.id}`);
        let flower_path = d3.line<Victor>()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveCatmullRomClosed.alpha(0.5))(this.cps)!
        let flower_gen = gen.path(flower_path,
            {
                roughness: 1,
                bowing: 1,
                seed: this.id * 30 || 1,
                stroke: '#2E4A62',
                strokeWidth: 3,
                fill: '#7FB3D5',
            }
        )
        let flower_paths = gen.toPaths(flower_gen);
        lotus_flower
            .selectAll<SVGPathElement, unknown>(`#lotus_flower_path_${this.id}`)
            .data(flower_paths)
            .join("path")
            .attr("id", `lotus_flower_path_${this.id}`)
            .attr("d", d => d.d)
            .attr("stroke", d => d.stroke)
            .attr("stroke-width", d => d.strokeWidth)
            .attr("fill", d => d.fill || "none");

        lotus_flower.selectAll<SVGPathElement, unknown>(`#lotus_flower_delaunay_${this.id}`)
            .data([this.id])
            .join("path")
            .attr("id", `lotus_flower_delaunay_${this.id}`)
            .attr("d", () => {
                return this.delaunay.render();
            })
            .attr("stroke", "#00000033")
            .attr("stroke-width", 1)
            .attr("fill", "none");

        for (let i = 0; i < this.holes.length; i++) {
            let hole = this.holes[i]!;
            let hole_circle = lotus_flower
                .selectAll<SVGCircleElement, unknown>(`#lotus_flower_hole_${this.id}_${i}`)
                .data([this.id])
                .join("path")
                .attr("id", `lotus_flower_hole_${this.id}_${i}`)
                .attr("d", () => {
                    let neighbors = [...this.delaunay.neighbors(this.delaunay.find(hole.x, hole.y))];
                    let neighbor_points = neighbors.map(n => {
                        let p = this.delaunay.points[n * 2]!;
                        let q = this.delaunay.points[n * 2 + 1]!;
                        return new Victor(p, q);
                    });
                    let line_generator = d3.line<Victor>()
                        .x(d => d.x)
                        .y(d => d.y)
                        .curve(d3.curveCatmullRomClosed.alpha(0.5));
                    return line_generator(neighbor_points)!;
                })
                .attr("fill", "#000000f1");
        }
    }
    tick(env: Environment, step: number): void {
    }
    remove(): void {
        this.container.selectAll<SVGGElement, unknown>(`#lotus_flower_${this.id}`).remove();
    }
}

class Hair implements Element {
    static id_cnt: number = 0;
    id: number = 0;
    constructor(public start: Victor, public end: Victor, private container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public angle: number = 0) {
        this.id = Hair.id_cnt++;
    }
    draw(env: Environment): void {
        let hair_group = this.container
            .selectAll<SVGGElement, unknown>(`#hair_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `hair_${this.id}`);

        let hair_path = hair_group
            .selectAll<SVGPathElement, unknown>(`#hair_path_${this.id}`)
            .data([this.id])
            .join("path")
            .attr("id", `hair_path_${this.id}`)
            .attr("d", () => {
                let current_angle = Math.atan2(this.end.y - this.start.y, this.end.x - this.start.x);
                let length = this.start.distance(this.end);

                let control_point1 = this.start.clone().add(new Victor(Math.cos(current_angle + this.angle), Math.sin(current_angle + this.angle)).multiplyScalar(length / 2));
                let control_point2 = this.end.clone().add(new Victor(Math.cos(current_angle - this.angle), Math.sin(current_angle - this.angle)).multiplyScalar(-length / 2));

                return `M ${this.start.x} ${this.start.y} C ${control_point1.x} ${control_point1.y}, ${control_point2.x} ${control_point2.y}, ${this.end.x} ${this.end.y}`;
            })
            .attr("stroke", "#514834")
            .attr("stroke-width", 1)
            .attr("fill", "none");
    }
    tick(env: Environment, step: number): void {
    }
    remove(): void {
        this.container.selectAll<SVGGElement, unknown>(`#hair_${this.id}`).remove();
    }
    get pos(): Victor {
        return this.start.clone().add(this.end).multiplyScalar(0.5);
    }
    get type(): string {
        return "hair";
    }
}
class TreeTrunk implements Element {
    static id_cnt: number = 0;
    id: number = 0;
    control_points: Victor[] = [];
    widths: number[] = [];
    hairs: Hair[] = [];
    has_changed: boolean = true;
    first_draw: boolean = true;
    constructor(public x_pos: number, public container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public width: number = 50) {
        this.id = TreeTrunk.id_cnt++;
        let total_height = container.node()!.getBoundingClientRect().height;
        let num_segments = 5;
        let segment_height = total_height / num_segments;

        for (let i = 0; i <= num_segments; i++) {
            let offset = (Math.random() - 0.5) * this.width * 0.2;
            this.control_points.push(new Victor(this.x_pos + offset, total_height - i * segment_height));

            let width_variation = (Math.random() - 0.5) * this.width * 0.2;
            let distance_to_center = Math.abs(i - num_segments / 2);
            let width_set = width + distance_to_center * distance_to_center * (this.width / num_segments) * 0.5;
            this.widths.push(width_set + width_variation);
        }

        // for (let i = 0; i < this.control_points.length - 1; i++) {
        //     let start = this.control_points[i]!;
        //     let end = this.control_points[i + 1]!;
        //     let num_hairs = Math.floor(Math.random() * 5 + 3);
        //     for (let j = 0; j < num_hairs; j++) {
        //         let hair_start = lerpVictor(start, end, Math.random());
        //         let hair_length = Math.random() * 20 + 10;
        //         let hair_angle = Math.random() * Math.PI - Math.PI / 2;
        //         let hair_end = hair_start.clone().add(new Victor(Math.cos(hair_angle), Math.sin(hair_angle)).multiplyScalar(hair_length));
        //         this.hairs.push(new Hair(hair_start, hair_end, container));
        //     }
        // }
    }
    get all_points(): Victor[] {
        let left_side_points: Victor[] = [];
        let right_side_points: Victor[] = [];
        for (let i = 0; i < this.control_points.length; i++) {
            let cp = this.control_points[i]!;
            let angle = Math.atan2(this.control_points[Math.min(i + 1, this.control_points.length - 1)]!.y - cp.y, this.control_points[Math.min(i + 1, this.control_points.length - 1)]!.x - cp.x) + Math.PI / 2;
            let thickness = this.widths[i] || 200;
            let left_point = cp.clone().add(new Victor(Math.cos(angle), Math.sin(angle)).multiplyScalar(thickness / 2));
            let right_point = cp.clone().add(new Victor(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI)).multiplyScalar(thickness / 2));
            left_side_points.push(left_point);
            right_side_points.push(right_point);
        }
        right_side_points.reverse();
        return left_side_points.concat(right_side_points);
    }
    draw(env: Environment): void {
        if (this.has_changed === false && this.first_draw === false) {
            return;
        }
        let trunk_group = this.container
            .selectAll<SVGGElement, unknown>(`#tree_trunk_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `tree_trunk_${this.id}`);

        let trunk_path = d3.line<Victor>()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveCatmullRom.alpha(0.5))(this.all_points)!;
        let trunk_gen = gen.path(trunk_path,
            {
                seed: this.id * 40 || 1,
                stroke: '#3A7D98',
                strokeWidth: 2,
                fill: '#3F8493',
                fillStyle: 'hatched',
                hachureAngle: 60,
                hachureGap: 1,
            }
        )
        let trunk_paths = gen.toPaths(trunk_gen);
        trunk_group
            .selectAll<SVGPathElement, unknown>(`#trunk_path_${this.id}`)
            .data(trunk_paths)
            .join("path")
            .attr("id", `trunk_path_${this.id}`)
            .attr("d", d => d.d)
            .attr("stroke", d => d.stroke)
            .attr("stroke-width", d => d.strokeWidth)
            .attr("fill", d => d.fill || "none");
        this.hairs.forEach(hair => hair.draw(env));
    }
    tick(env: Environment, step: number): void {
        this.hairs.forEach(hair => hair.tick(env, step));
    }
    remove(): void {
        this.container.selectAll<SVGGElement, unknown>(`#tree_trunk_${this.id}`).remove();
        this.hairs.forEach(hair => hair.remove());
    }
    get pos(): Victor {
        return this.control_points[0]!;
    }
    get type(): string {
        return "tree_trunk";
    }
}
class HillyBackground implements Element {
    static id_cnt: number = 0;
    id: number = 0;
    cps: Victor[] = [];
    constructor(public container: d3.Selection<SVGSVGElement, unknown, null, undefined>, public width: number, public height: number, public hillCount: number = 5) {
        this.id = HillyBackground.id_cnt++;
        for (let i = 0; i < this.hillCount; i++) {
            let x = (i / (this.hillCount - 1)) * this.width;
            let y = this.height * 0.5 + (Math.random() - 0.5) * this.height * 0.3;
            this.cps.push(new Victor(x, y));
        }
    }
    draw(env: Environment): void {
        let background = this.container
            .selectAll<SVGGElement, unknown>(`#hilly_background_${this.id}`)
            .data([this.id])
            .join("g")
            .attr("id", `hilly_background_${this.id}`);

        let hillPath = d3.line<Victor>()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveMonotoneX)([
                new Victor(0, env.bounds.height),
                ...this.cps,
                new Victor(this.width, env.bounds.height),
            ])!;

        let hillGen = gen.path(hillPath, {
            seed: this.id * 50 || 1,
            stroke: "none",
            fill: d3.interpolate("#1E3040", "#254766")(this.id / 10),
            roughness: 2,
            bowing: 1,
        });

        let hillPaths = gen.toPaths(hillGen);
        background
            .selectAll<SVGPathElement, unknown>(`#hill_path_${this.id}`)
            .data(hillPaths)
            .join("path")
            .attr("id", `hill_path_${this.id}`)
            .attr("d", d => d.d)
            .attr("fill", d => d.fill || "none");
    }
    tick(env: Environment, step: number): void {
        // Background hills are static, no tick logic needed
    }
    remove(): void {
        this.container.selectAll<SVGGElement, unknown>(`#hilly_background_${this.id}`).remove();
    }
    get pos(): Victor {
        return new Victor(0, this.height);
    }
    get type(): string {
        return "hilly_background";
    }
}

const env = new Environment(container);

setInterval(() => {
    env.tick();
    env.draw();
}, 1000 / 60);
