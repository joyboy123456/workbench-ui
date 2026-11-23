import type { FashionModel, ImageRef, Material, Product } from './types'

export interface AssetReferenceChoice {
  id: string
  label: string
  group: '商品' | '模特' | '素材' | '画布'
  image: ImageRef
}

export function toAssetReferenceChoices(
  products: Product[],
  models: FashionModel[],
  materials: Material[],
): AssetReferenceChoice[] {
  return [
    ...products.flatMap((product) => product.images.map((image, index) => ({
      id: `product:${product.id}:${image.id}`,
      label: `${product.name} · 图 ${index + 1}`,
      group: '商品' as const,
      image,
    }))),
    ...models.map((model) => ({
      id: `model:${model.id}`,
      label: model.name,
      group: '模特' as const,
      image: model.cover,
    })),
    ...materials.map((material) => ({
      id: `material:${material.id}`,
      label: material.name,
      group: '素材' as const,
      image: material.image,
    })),
  ]
}
