export const MATERIAL_COLORS = [
  "#ff3b30",
  "#007aff",
  "#34c759",
  "#ff9500",
  "#af52de",
  "#00a6a6",
  "#ff2d55",
  "#8b5e3c",
] as const;
export type MaterialPoint = { x: number; y: number };
export type MaterialStroke = {
  points: MaterialPoint[];
  size: number;
  note: string;
};
export type MaterialReference = {
  assetId: string;
  name: string;
  role: "color" | "material" | "accessory";
  color: string;
  regionNote?: string;
  strokes: MaterialStroke[];
};
export interface MaterialEditSpec {
  version: 1;
  mode: "recolor" | "replace" | "recolor-material" | "region-edit";
  baseAssetId: string;
  materials: MaterialReference[];
  instruction: string;
  targetColor?: string;
}
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length <= max ? v.trim() : null;
const id = (v: unknown) =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(v);
const fraction = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
export function normalizeMaterialEdit(
  value: unknown,
  assetIds: string[],
): MaterialEditSpec {
  if (
    !record(value) ||
    value.version !== 1 ||
    !["recolor", "replace", "recolor-material", "region-edit"].includes(
      String(value.mode),
    )
  )
    throw new Error("换料换色参数版本无效");
  if (
    !id(value.baseAssetId) ||
    !Array.isArray(value.materials) ||
    value.materials.length < 1 ||
    value.materials.length > 8
  )
    throw new Error("需要底款及1至8张参考图");
  const instruction = text(value.instruction ?? "", 3000);
  if (instruction === null) throw new Error("补充要求不能超过3000字");
  let fabricIndex = 0;
  const materials: MaterialReference[] = value.materials.map((item, index) => {
    if (
      !record(item) ||
      !id(item.assetId) ||
      !text(item.name, 80) ||
      !["color", "material", "accessory"].includes(String(item.role))
    )
      throw new Error("参考图角色或部位名称无效");
    const regionNote = text(item.regionNote ?? "", 200);
    if (regionNote === null) throw new Error("遮罩区域说明不能超过200字");
    const strokes = item.strokes ?? [];
    if (!Array.isArray(strokes) || strokes.length > 160)
      throw new Error("部位笔迹过多");
    let points = 0;
    const normalized = strokes.map((stroke) => {
      if (
        !record(stroke) ||
        !fraction(stroke.size) ||
        stroke.size <= 0 ||
        stroke.size > 0.1 ||
        !Array.isArray(stroke.points) ||
        !stroke.points.length
      )
        throw new Error("笔迹格式无效");
      points += stroke.points.length;
      if (
        points > 3000 ||
        !stroke.points.every((p) => record(p) && fraction(p.x) && fraction(p.y))
      )
        throw new Error("笔迹坐标或数量无效");
      const note = text(stroke.note ?? "", 200);
      if (note === null) throw new Error("单笔说明过长");
      return {
        size: stroke.size,
        points: stroke.points.map((p) => ({
          x: p.x as number,
          y: p.y as number,
        })),
        note,
      };
    });
    return {
      assetId: item.assetId as string,
      name: (item.name as string).trim(),
      role: item.role as MaterialReference["role"],
      color:
        value.mode === "region-edit"
          ? MATERIAL_COLORS[item.role === "color" ? 0 : ++fabricIndex]
          : MATERIAL_COLORS[index],
      strokes: normalized,
      ...(regionNote ? { regionNote } : {}),
    };
  });
  const expected = [
    value.baseAssetId as string,
    ...materials.map((m) => m.assetId),
  ];
  if (
    new Set(expected).size !== expected.length ||
    JSON.stringify(expected) !== JSON.stringify(assetIds)
  )
    throw new Error("底款与参考图顺序或归属绑定不一致");
  if (
    value.targetColor !== undefined &&
    (typeof value.targetColor !== "string" ||
      !/^#[a-f0-9]{6}$/i.test(value.targetColor))
  )
    throw new Error("目标色值无效");
  if (
    value.mode === "recolor" &&
    (materials.length !== 1 ||
      materials[0].role !== "color" ||
      materials[0].strokes.length)
  )
    throw new Error("整件同料换色仅取一张色样，不使用选区");
  if (
    value.mode === "recolor-material" &&
    (materials.length !== 2 ||
      materials[0].role !== "color" ||
      materials[0].strokes.length !== 0 ||
      materials[1].role !== "material" ||
      materials[1].strokes.length === 0)
  )
    throw new Error("组合编辑需要图2目标色样、图3材料参考，并涂抹换料区域");
  if (value.mode === "region-edit") {
    const fabrics = materials.slice(materials[0].role === "color" ? 1 : 0);
    if (fabrics.length > 4 || fabrics.some(material => material.role !== "material"))
      throw new Error("参考图按色样、花型顺序上传，色样最多1张，花型最多4张");
    if (value.targetColor !== undefined && materials[0].role !== "color")
      throw new Error("目标色微调需要色样参考");
  }
  return {
    version: 1,
    mode: value.mode as MaterialEditSpec["mode"],
    baseAssetId: value.baseAssetId as string,
    materials,
    instruction,
    ...(value.targetColor ? { targetColor: value.targetColor as string } : {}),
  };
}
export function compileMaterialPrompt(spec: MaterialEditSpec): string {
  if (spec.mode === "region-edit") return compileRegionEditPrompt(spec);
  const parts = [
    "图1是唯一服装底款。保留人物、背景、姿势、构图、版型、接缝、口袋、纽扣、门襟及袖口结构。",
  ];
  if (spec.mode === "recolor-material") {
    const material = spec.materials[1];
    parts.push(
      `图2是目标色样，只提供颜色${spec.targetColor ? `，目标色值${spec.targetColor}` : ""}。仅改变图1衣身及同面料袖子的颜色，保留原织纹、质感、褶皱和光影；不得移植图2的材质、花型或背景。排除下述换料区域，其他材质与辅料保持不变。`,
      `图3是「${material.name}」的材料参考，只在图1蓝色遮罩（${material.color}）标记的部位应用图3的花型、织纹、材质及颜色，沿原服装分片铺排花型。保留该部位原来的轮廓、接缝、位置、褶皱走向和光照，不复制图3背景或商品形状，不将材料扩散到其他部位。`,
      `蓝色 ${material.color} 是定位标记色，不是目标面料颜色。涂抹覆盖及其指代的服装分片是换料范围，同色笔迹合并为同一换料区域，结合部位名称与区域说明处理边界；换料区域以图3为准，不再套用图2颜色。`,
    );
    const regionNote =
      material.regionNote ||
      [
        ...new Set(
          material.strokes.map((stroke) => stroke.note).filter(Boolean),
        ),
      ].join("；");
    if (regionNote)
      parts.push(`蓝色遮罩（${material.color}）区域说明：${regionNote}。`);
    parts.push(
      "去除所有彩色遮罩笔迹并恢复被遮挡细节。人物、背景和未指定区域保持不变。",
    );
  } else if (spec.mode === "recolor") {
    parts.push(
      `仅调整整件主体面料（衣身及同面料袖子）的颜色，无需圈选。图2只提供颜色${spec.targetColor ? `，目标色值${spec.targetColor}` : ""}，不得移植色样织纹、花型或材质。保留原面料织纹、质感、褶皱和光影；毛领、纽扣、拉链等其他材质不变。不得对整张照片统一染色。`,
    );
  } else {
    for (const [i, m] of spec.materials.entries()) {
      parts.push(
        `图${i + 2}对应「${m.name}」：${m.role === "color" ? "只取颜色，保留底款原织纹和材质" : m.role === "material" ? "取参考面料的织纹、材质和颜色" : "只取辅料外观"}。不得复制参考图背景或商品轮廓。`,
      );
      if (m.strokes.length) {
        parts.push(
          `图1上的${m.color}笔迹对应「${m.name}」。笔迹是部位定位，不是硬蒙版；沿服装分片和文字确定范围，不能只改细线。`,
        );
        m.strokes.forEach((s, j) =>
          parts.push(
            `该部位第${j + 1}笔${s.note ? `：${s.note}` : "按所在部位处理"}。`,
          ),
        );
      } else
        parts.push(`「${m.name}」按名称与补充说明定位，没有笔迹，不虚构涂鸦。`);
    }
    parts.push(
      "不同参考不得串位；未指定部位不变。去除所有彩色笔迹，恢复笔迹遮挡细节，不保留标记。",
    );
  }
  if (spec.instruction) parts.push(`用户补充要求：${spec.instruction}`);
  parts.push("只输出一张完整结果，不要拼图、对比、边框或额外文字。");
  return parts.join("\n");
}

function compileRegionEditPrompt(spec: MaterialEditSpec): string {
  const parts = ["图1是唯一服装底款与编辑主体。"];
  for (const [index, reference] of spec.materials.entries()) {
    const imageNumber = index + 2;
    const isColor = reference.role === "color";
    const mark = isColor ? "红色 #ff3b30" : "蓝色 #007aff";
    parts.push(
      isColor
        ? `图${imageNumber}是目标色样，仅提供颜色${spec.targetColor ? `，目标色值${spec.targetColor}` : ""}。只改变指定区域颜色，保留底款原织纹、材质、花型、褶皱和光影，不移植色样的纹理或背景。`
        : `图${imageNumber}是面料花型参考。将指定区域的底色、花纹和面料替换为图${imageNumber}的底色、图案和材质，花型沿原服装分片铺排并随褶皱自然转折；参考图只提供面料和图案，不改变主体与场景。`,
      `图${imageNumber}的替换部位：${reference.name}。`,
    );
    // An explicit whole-garment target includes differently coloured panels too.
    if (/^(所有面料|全部面料|整件服装|整件衣服|整件)$/.test(reference.name.trim())) {
      parts.push(
        "本项明确要求整件替换：目标服装的全部面料分片都属于编辑范围，包括左右衣身、全部袖子、领片、翻领、门襟、下摆及原本不同颜色的拼接块。逐片铺上参考花型，不得只改领口或某一色块；原图的拼色不是保护区。仍保留款式、绗缝和结构；用户明确排除的辅料或其他衣物继续保护。",
      );
    }
    if (reference.strokes.length) {
      parts.push(
        `图1上的${mark}涂抹对应图${imageNumber}。所有同色笔迹合并为同一个编辑区域，可分多笔、多块涂抹。结合部位名称与区域说明确定边界及排除项，限定在所指部位，不扩散到其他区域。标记色仅用于定位。`,
      );
    } else {
      parts.push(
        `图${imageNumber}按部位名称和区域说明在图1中定位，使用文字指定的范围。`,
      );
    }
    if (reference.regionNote)
      parts.push(`图${imageNumber}区域说明：${reference.regionNote}。`);
  }
  if (spec.instruction) parts.push(`用户补充要求：${spec.instruction}`);
  if (spec.materials.length === 2)
    parts.push(
      "两项编辑范围重叠时，重叠部位采用花型参考的底色、图案和材质，其余换色区域采用色样颜色。",
    );
  parts.push(
    "【编辑范围约束】仅编辑上面明确指定的衣物或分片，先区分目标衣物与保护区，再应用参考。叠穿的每件衣物都是独立对象，不能把内搭与外套视为同一片面料。目标衣物被其他衣物遮挡时，仅修改目标衣物当前可见的部分，不向遮挡它的衣物、袖子或相邻分片扩展。不为展示花型改变穿法、敞开衣服或暴露被遮挡部分。",
    "用户明确排除、要求保留的部位是保护区，即使与目标相邻、颜色接近或被同一笔迹碰到，也不得换色或换料。保护区保持原来的颜色、花纹、材质和光影。未点名的其他衣物与背景全部保留。",
    "保持图1服装款式、结构、轮廓、人物、姿势、构图、背景及未指定区域不变。保留真实光影，使面料转折关系清晰，衣服褶皱符合物理规律。不同参考不得串位，不复制参考图背景或商品轮廓。",
    "去除所有彩色定位笔迹并恢复被遮挡细节。只输出一张完整结果，不要拼图、对比、边框或额外文字。",
  );
  return parts.join("\n");
}
