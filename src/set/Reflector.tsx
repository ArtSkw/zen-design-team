import { useEffect, useMemo, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  DepthFormat, DepthTexture, HalfFloatType, LinearFilter, Matrix4, PerspectiveCamera, Plane, UnsignedShortType, Vector3, Vector4, WebGLRenderTarget,
  type ColorRepresentation, type Mesh, type Object3D,
} from 'three'
import { MeshReflectorMaterial as ReflectorImpl } from '@react-three/drei/materials/MeshReflectorMaterial.js'
import { BlurPass } from '@react-three/drei/materials/BlurPass.js'

// drei's <MeshReflectorMaterial> (the same material, blur pass and mirror maths), with
// two controls it lacks: `every` redraws the reflection only every N frames, on frames
// `offset` mod N (phones: a blurred reflection a frame behind is invisible, the saving is
// a whole scene pass; offsets keep two reflections from landing on the same frame),
// and `exclude` leaves objects out of this one reflection (the water never sees the
// cast: the terrace hides them from it anyway, but they cost a pass of their own).

/** Objects the water's reflection leaves out (the cast registers itself). */
export const notInWater = new Set<Object3D>()

type Props = {
  host: RefObject<Mesh | null> // the mesh this material is on
  resolution: number
  blur: [number, number]
  mixBlur: number
  mixStrength: number
  mirror: number
  depthScale?: number
  minDepthThreshold?: number
  maxDepthThreshold?: number
  color: ColorRepresentation
  roughness: number
  metalness: number
  every?: number
  offset?: number
  exclude?: Set<Object3D>
}

export function ReflectorMaterial({ host, resolution, blur, mixBlur, mixStrength, mirror, depthScale = 0, minDepthThreshold = 0.9, maxDepthThreshold = 1, color, roughness, metalness, every = 1, offset = 0, exclude }: Props) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const k = useMemo(
    () => ({
      plane: new Plane(), normal: new Vector3(), pos: new Vector3(), eye: new Vector3(), rot: new Matrix4(), look: new Vector3(),
      clip: new Vector4(), view: new Vector3(), target: new Vector3(), q: new Vector4(), textureMatrix: new Matrix4(), cam: new PerspectiveCamera(),
      frame: 0, hidden: [] as Object3D[],
    }),
    [],
  )
  const [fbo1, fbo2, pass, mat] = useMemo(() => {
    const params = { minFilter: LinearFilter, magFilter: LinearFilter, type: HalfFloatType }
    const fbo1 = new WebGLRenderTarget(resolution, resolution, params)
    fbo1.depthBuffer = true
    fbo1.depthTexture = new DepthTexture(resolution, resolution)
    fbo1.depthTexture.format = DepthFormat
    fbo1.depthTexture.type = UnsignedShortType
    const fbo2 = new WebGLRenderTarget(resolution, resolution, params)
    const pass = new BlurPass({ gl, resolution, width: blur[0], height: blur[1], minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias: 0.25 })
    const mat = new ReflectorImpl({ color, roughness, metalness })
    Object.assign(mat, {
      mirror, textureMatrix: k.textureMatrix, mixBlur, mixStrength, minDepthThreshold, maxDepthThreshold, depthScale,
      depthToBlurRatioBias: 0.25, distortion: 1, mixContrast: 1, tDiffuse: fbo1.texture, tDepth: fbo1.depthTexture, tDiffuseBlur: fbo2.texture,
      hasBlur: blur[0] + blur[1] > 0,
    })
    mat.defines = { ...mat.defines, ...(blur[0] + blur[1] > 0 ? { USE_BLUR: '' } : {}), ...(depthScale > 0 ? { USE_DEPTH: '' } : {}) }
    return [fbo1, fbo2, pass, mat] as const
  }, [gl, k, resolution, blur[0], blur[1], mixBlur, mixStrength, mirror, depthScale, minDepthThreshold, maxDepthThreshold, color, roughness, metalness])
  useEffect(
    () => () => {
      fbo1.dispose()
      fbo2.dispose()
      pass.renderTargetA.dispose()
      pass.renderTargetB.dispose()
      mat.dispose()
    },
    [fbo1, fbo2, pass, mat],
  )

  // the mirror camera and the texture matrix, as drei computes them
  const place = (parent: Mesh) => {
    const { normal, pos, eye, rot, look, view, target, cam, textureMatrix, plane, clip, q } = k
    pos.setFromMatrixPosition(parent.matrixWorld)
    eye.setFromMatrixPosition(camera.matrixWorld)
    rot.extractRotation(parent.matrixWorld)
    normal.set(0, 0, 1).applyMatrix4(rot)
    view.subVectors(pos, eye)
    if (view.dot(normal) > 0) return false // facing away
    view.reflect(normal).negate().add(pos)
    rot.extractRotation(camera.matrixWorld)
    look.set(0, 0, -1).applyMatrix4(rot).add(eye)
    target.subVectors(pos, look).reflect(normal).negate().add(pos)
    cam.position.copy(view)
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal)
    cam.lookAt(target)
    cam.far = camera.far
    cam.updateMatrixWorld()
    cam.projectionMatrix.copy(camera.projectionMatrix)
    textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0)
    textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(parent.matrixWorld)
    // the oblique near plane on the mirror (terathon.com/code/oblique.html)
    plane.setFromNormalAndCoplanarPoint(normal, pos).applyMatrix4(cam.matrixWorldInverse)
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
    const pm = cam.projectionMatrix
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0]
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5]
    q.z = -1.0
    q.w = (1.0 + pm.elements[10]) / pm.elements[14]
    clip.multiplyScalar(2.0 / clip.dot(q))
    pm.elements[2] = clip.x
    pm.elements[6] = clip.y
    pm.elements[10] = clip.z + 1.0
    pm.elements[14] = clip.w
    return true
  }

  useFrame(() => {
    const parent = host.current
    if (!parent || k.frame++ % every !== offset % every) return
    if (!place(parent)) return
    parent.visible = false
    k.hidden.length = 0
    if (exclude)
      for (const o of exclude)
        if (o.visible) {
          o.visible = false
          k.hidden.push(o)
        }
    const autoUpdate = gl.shadowMap.autoUpdate
    gl.shadowMap.autoUpdate = false
    gl.setRenderTarget(fbo1)
    gl.state.buffers.depth.setMask(true)
    if (!gl.autoClear) gl.clear()
    gl.render(scene, k.cam)
    if (blur[0] + blur[1] > 0) pass.render(gl, fbo1, fbo2)
    gl.shadowMap.autoUpdate = autoUpdate
    for (const o of k.hidden) o.visible = true
    parent.visible = true
    gl.setRenderTarget(null)
  })

  return <primitive object={mat} attach="material" />
}
