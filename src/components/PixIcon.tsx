/** 像素图标：/public/icons/*.png（16×16 手绘像素画），替代 lucide 线性图标 */
export default function PixIcon({ name, size = 18, className, style }: {
  name: string; size?: number; className?: string; style?: React.CSSProperties
}) {
  return (
    <img src={`/icons/${name}.png`} width={size} height={size} alt="" draggable={false}
      className={className}
      style={{ imageRendering: 'pixelated', flexShrink: 0, ...style }} />
  )
}
