import type { Feature, Geometry, Position } from "geojson";
import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";

const CIRCUMFERENCE = 40_075_016.68557849;
/** Mercator x/y with the height kept in meters; the shader scales it like MapLibre does. */
function mercator(
  position: Position,
  height: number,
): [number, number, number] {
  const latitude = (position[1] * Math.PI) / 180;
  return [
    (position[0] + 180) / 360,
    (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2,
    height,
  ];
}
/**
 * Fill extrusions turn meters into world units at the map center latitude,
 * not per vertex, so lines must use the same factor to sit on the roofs.
 */
function zScale(map: MapLibreMap | null) {
  const latitude = ((map?.getCenter().lat ?? 23.6) * Math.PI) / 180;
  return 1 / (CIRCUMFERENCE * Math.cos(latitude));
}
// The depth nudge keeps edges in front of their own roof and walls instead of flickering into them.
const VERTEX_SHADER =
  "#version 300 es\nin vec3 a_pos; uniform mat4 u_matrix; uniform float u_zscale; void main(){gl_Position=u_matrix*vec4(a_pos.xy,a_pos.z*u_zscale,1.0); gl_Position.z-=0.0004*gl_Position.w;}";
function rings(geometry: Geometry): Position[][] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon")
    return geometry.coordinates.flatMap((p) => p);
  return [];
}
function center(ring: Position[]): Position {
  let area = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i],
      b = ring[i + 1],
      cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    x += (a[0] + b[0]) * cross;
    y += (a[1] + b[1]) * cross;
  }
  return area ? [x / (3 * area), y / (3 * area)] : ring[0];
}
function ringArea(ring: Position[]) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++)
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(area);
}

/** Selected roof outline and callout share MapLibre's public Mercator projection matrix. */
export function createMapSelection(
  onProject: (x: number, y: number, visible: boolean) => void,
) {
  let vertices = new Float32Array(),
    offsets: Array<[number, number]> = [];
  let anchor: [number, number, number] | null = null,
    dirty = true;
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null;
  let vao: WebGLVertexArrayObject | null = null,
    uniform: WebGLUniformLocation | null = null,
    scaleUniform: WebGLUniformLocation | null = null;
  let map: MapLibreMap | null = null;
  let lineWidth = 1;
  const layer: CustomLayerInterface = {
    id: "selected-roof-outline",
    type: "custom",
    renderingMode: "3d",
    onAdd(added, gl) {
      map = added;
      const shader = (type: number, source: string) => {
        const value = gl.createShader(type)!;
        gl.shaderSource(value, source);
        gl.compileShader(value);
        if (!gl.getShaderParameter(value, gl.COMPILE_STATUS))
          throw new Error("No se pudo dibujar el contorno 3D");
        return value;
      };
      const vertex = shader(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragment = shader(
        gl.FRAGMENT_SHADER,
        "#version 300 es\nprecision mediump float; out vec4 color; void main(){color=vec4(1.0,0.98,0.91,1.0);}",
      );
      program = gl.createProgram()!;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("Contorno 3D no disponible");
      uniform = gl.getUniformLocation(program, "u_matrix");
      scaleUniform = gl.getUniformLocation(program, "u_zscale");
      buffer = gl.createBuffer();
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const position = gl.getAttribLocation(program, "a_pos");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      const range = gl.getParameter(
        gl.ALIASED_LINE_WIDTH_RANGE,
      ) as Float32Array;
      lineWidth = Math.min(2, range[1]);
    },
    render(gl, args) {
      const matrix = args.defaultProjectionData.mainMatrix;
      const scale = zScale(map);
      if (anchor) {
        const [x, y] = anchor,
          z = anchor[2] * scale;
        const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
        const px =
          (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w;
        const py =
          (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w;
        const canvas = gl.canvas as HTMLCanvasElement;
        onProject(
          ((px + 1) * canvas.clientWidth) / 2,
          ((1 - py) * canvas.clientHeight) / 2,
          w > 0 && Math.abs(px) < 0.98 && Math.abs(py) < 0.98,
        );
      }
      if (!program || !vertices.length) return;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (dirty) {
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
        dirty = false;
      }
      gl.uniformMatrix4fv(uniform, false, new Float32Array(matrix));
      gl.uniform1f(scaleUniform, scale);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.lineWidth(lineWidth);
      for (const [start, count] of offsets)
        gl.drawArrays(gl.LINE_STRIP, start, count);
      gl.bindVertexArray(null);
    },
    onRemove(_map, gl) {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      map = null;
      onProject(0, 0, false);
    },
  };
  return {
    layer,
    update(feature: Feature | undefined, height: number) {
      const contours = feature?.geometry ? rings(feature.geometry) : [];
      const points: number[] = [];
      offsets = [];
      for (const contour of contours) {
        offsets.push([points.length / 3, contour.length]);
        for (const p of contour) points.push(...mercator(p, height + 250));
      }
      vertices = new Float32Array(points);
      dirty = true;
      const largest = contours.reduce<Position[] | null>(
        (best, ring) =>
          !best || ringArea(ring) > ringArea(best) ? ring : best,
        null,
      );
      anchor = largest ? mercator(center(largest), height + 250) : null;
      if (!anchor) onProject(0, 0, false);
    },
  };
}

/** State borders drawn on each extruded roof, so 3D outlines match the blocks. */
export function createRoofBorders() {
  let vertices = new Float32Array(),
    offsets: Array<[number, number]> = [];
  let dirty = true,
    visible = false;
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null;
  let vao: WebGLVertexArrayObject | null = null,
    uniform: WebGLUniformLocation | null = null,
    scaleUniform: WebGLUniformLocation | null = null;
  let map: MapLibreMap | null = null;
  const layer: CustomLayerInterface = {
    id: "states-roof-borders",
    type: "custom",
    renderingMode: "3d",
    onAdd(added, gl) {
      map = added;
      const shader = (type: number, source: string) => {
        const value = gl.createShader(type)!;
        gl.shaderSource(value, source);
        gl.compileShader(value);
        if (!gl.getShaderParameter(value, gl.COMPILE_STATUS))
          throw new Error("No se pudieron dibujar las fronteras 3D");
        return value;
      };
      const vertex = shader(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragment = shader(
        gl.FRAGMENT_SHADER,
        "#version 300 es\nprecision mediump float; out vec4 color; void main(){color=vec4(0.043,0.071,0.125,1.0);}",
      );
      program = gl.createProgram()!;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("Fronteras 3D no disponibles");
      uniform = gl.getUniformLocation(program, "u_matrix");
      scaleUniform = gl.getUniformLocation(program, "u_zscale");
      buffer = gl.createBuffer();
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const position = gl.getAttribLocation(program, "a_pos");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    },
    render(gl, args) {
      if (!visible || !program || !vertices.length) return;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (dirty) {
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
        dirty = false;
      }
      gl.uniformMatrix4fv(
        uniform,
        false,
        new Float32Array(args.defaultProjectionData.mainMatrix),
      );
      gl.uniform1f(scaleUniform, zScale(map));
      // Depth test hides the edges that sit behind taller states.
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const [start, count] of offsets)
        gl.drawArrays(gl.LINE_STRIP, start, count);
      gl.bindVertexArray(null);
    },
    onRemove(_map, gl) {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      map = null;
    },
  };
  return {
    layer,
    update(shapes: Array<{ feature: Feature; height: number }>, show: boolean) {
      visible = show;
      const points: number[] = [];
      offsets = [];
      for (const { feature, height } of shapes)
        for (const contour of feature.geometry ? rings(feature.geometry) : []) {
          // Drop points closer than ~200 m: invisible at this scale, much lighter to redraw.
          const kept = contour.filter(
            (p, i) =>
              i === 0 ||
              i === contour.length - 1 ||
              Math.abs(p[0] - contour[i - 1][0]) +
                Math.abs(p[1] - contour[i - 1][1]) >
                0.002,
          );
          offsets.push([points.length / 3, kept.length]);
          // A small lift keeps the line above the roof surface without floating.
          for (const p of kept) points.push(...mercator(p, height + 150));
        }
      vertices = new Float32Array(points);
      dirty = true;
    },
  };
}
