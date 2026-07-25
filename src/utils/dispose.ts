import * as THREE from "three";

/** Recursively disposes geometries/materials/textures of an Object3D and removes it from its parent. */
export function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = (child as THREE.Mesh).material;
    if (material) {
      if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
      } else {
        disposeMaterial(material as THREE.Material);
      }
    }
  });
  obj.parent?.remove(obj);
}

function disposeMaterial(material: THREE.Material): void {
  const mat = material as THREE.MeshStandardMaterial;
  mat.map?.dispose();
  mat.normalMap?.dispose();
  mat.roughnessMap?.dispose();
  mat.emissiveMap?.dispose();
  material.dispose();
}
