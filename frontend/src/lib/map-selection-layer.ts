import type { Feature, Geometry, Position } from "geojson";
import type { CustomLayerInterface } from "maplibre-gl";

const CIRCUMFERENCE = 40_075_016.68557849;
function mercator(
  position: Position,
  height: number,
): [number, number, number] {
  const latitude = (position[1] * Math.PI) / 180;
  return [
    (position[0] + 180) / 360,
    (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2,
    height / (CIRCUMFERENCE * Math.cos(latitude)),
  ];
}
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
    uniform: WebGLUniformLocation | null = null;
  let lineWidth = 1;
  const layer: CustomLayerInterface = {
    id: "selected-roof-outline",
    type: "custom",
    renderingMode: "3d",
    onAdd(_map, gl) {
      const shader = (type: number, source: string) => {
        const value = gl.createShader(type)!;
        gl.shaderSource(value, source);
        gl.compileShader(value);
        if (!gl.getShaderParameter(value, gl.COMPILE_STATUS))
          throw new Error("No se pudo dibujar el contorno 3D");
        return value;
      };
      const vertex = shader(
        gl.VERTEX_SHADER,
        "#version 300 es\nin vec3 a_pos; uniform mat4 u_matrix; void main(){gl_Position=u_matrix*vec4(a_pos,1.0);}",
      );
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
      if (anchor) {
        const [x, y, z] = anchor;
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
        for (const p of contour) points.push(...mercator(p, height + 600));
      }
      vertices = new Float32Array(points);
      dirty = true;
      const largest = contours.reduce<Position[] | null>(
        (best, ring) =>
          !best || ringArea(ring) > ringArea(best) ? ring : best,
        null,
      );
      anchor = largest ? mercator(center(largest), height + 600) : null;
      if (!anchor) onProject(0, 0, false);
    },
  };
}
