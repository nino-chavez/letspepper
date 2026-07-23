/**
 * OG share-card builders — 1200×630, rendered via next/og (Satori + resvg).
 *
 * Two cards, one brand language (Pepper Black + heat color + anime mascot):
 *   - BrandCard()      site / home default (and every page without its own card)
 *   - TournamentCard() per flavor — the heat color IS the accent (brand-native)
 *
 * Satori notes: every element with >1 child must declare `display: flex`; CSS
 * custom properties don't resolve, so colors are passed as hex. The mascot is a
 * palette-quantized PNG bundled INTO the edge route (fetch(new URL(...))) and
 * passed in as an ArrayBuffer — never a remote fetch, so the most-shared URL
 * can't fail on a network dependency. Satori can't decode WebP; keep these PNG.
 */

import { HEAT_HEX, HEAT_LEVEL, type TournamentDetail } from './tournaments'

export const OG_SIZE = { width: 1200, height: 630 }

const PEPPER_BLACK = '#0a0a0a'
const HEAT_SPECTRUM = ['#4ade80', '#facc15', '#f97316'] // bell → poblano → jalapeño

/** Heat → number of filled meter bars. */
const HEAT_BARS: Record<TournamentDetail['heat'], number> = { bell: 1, poblano: 2, jalapeno: 3 }

/** Drop the street address — the park name reads cleaner on a card. */
function shortVenue(location: string): string {
	return location.split('·')[0]?.trim() || location
}

function HeatMeter({ heat }: { heat: TournamentDetail['heat'] }) {
	const filled = HEAT_BARS[heat]
	const color = HEAT_HEX[heat]
	return (
		<div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					style={{
						display: 'flex',
						width: '34px',
						height: '10px',
						borderRadius: '5px',
						background: i < filled ? color : 'rgba(255,255,255,0.14)'
					}}
				/>
			))}
		</div>
	)
}

/** Bottom-right mascot figure — behind the type, backlit by the heat glow
 *  (mirrors the site's flavor-hero composition). Satori accepts an ArrayBuffer
 *  as img src at runtime; the cast keeps TS quiet. */
function MascotFigure({ data }: { data: ArrayBuffer }) {
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={data as unknown as string}
			alt=""
			width={380}
			height={570}
			style={{
				position: 'absolute',
				right: '36px',
				bottom: '-14px',
				width: '380px',
				height: '570px',
				objectFit: 'contain'
			}}
		/>
	)
}

export function TournamentCard(t: TournamentDetail, mascot?: ArrayBuffer) {
	const accent = HEAT_HEX[t.heat]
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				width: '1200px',
				height: '630px',
				background: PEPPER_BLACK,
				padding: '64px 72px',
				fontFamily: 'sans-serif',
				position: 'relative',
				overflow: 'hidden'
			}}
		>
			{/* heat glow */}
			<div
				style={{
					display: 'flex',
					position: 'absolute',
					top: '-120px',
					right: '-120px',
					width: '520px',
					height: '520px',
					borderRadius: '50%',
					background: `radial-gradient(circle, ${accent}3a 0%, transparent 66%)`
				}}
			/>
			{mascot ? <MascotFigure data={mascot} /> : null}
			{/* eyebrow */}
			<div
				style={{
					display: 'flex',
					flexDirection: 'row',
					alignItems: 'center',
					gap: '14px',
					fontSize: '20px',
					fontWeight: 700,
					letterSpacing: '0.18em',
					textTransform: 'uppercase',
					color: accent,
					marginBottom: '20px',
					zIndex: 1
				}}
			>
				<div style={{ display: 'flex' }}>Let&apos;s Pepper Series</div>
				<div style={{ display: 'flex', color: 'rgba(255,255,255,0.3)' }}>·</div>
				<div style={{ display: 'flex' }}>{HEAT_LEVEL[t.heat]}</div>
			</div>
			{/* title */}
			<div
				style={{
					display: 'flex',
					fontSize: t.name.length > 18 ? '92px' : '108px',
					fontWeight: 900,
					color: '#ffffff',
					lineHeight: '0.9',
					letterSpacing: '-0.02em',
					textTransform: 'uppercase',
					maxWidth: '780px',
					zIndex: 1
				}}
			>
				{t.name}
			</div>
			{/* spacer */}
			<div style={{ display: 'flex', flex: 1 }} />
			{/* meta */}
			<div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '28px', zIndex: 1 }}>
				<div style={{ display: 'flex', fontSize: '30px', fontWeight: 700, color: '#ffffff' }}>{t.date}</div>
				<div style={{ display: 'flex', fontSize: '22px', color: 'rgba(255,255,255,0.55)' }}>{shortVenue(t.location)}</div>
			</div>
			{/* footer — capped short of the mascot zone so the domain never sits under its feet */}
			<div
				style={{
					display: 'flex',
					flexDirection: 'row',
					justifyContent: 'space-between',
					alignItems: 'center',
					maxWidth: '740px',
					width: '100%',
					zIndex: 1
				}}
			>
				<HeatMeter heat={t.heat} />
				<div style={{ display: 'flex', fontSize: '20px', fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.5)' }}>
					letspepper.com
				</div>
			</div>
		</div>
	)
}

export function BrandCard(mascot?: ArrayBuffer) {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				width: '1200px',
				height: '630px',
				background: PEPPER_BLACK,
				padding: '72px',
				fontFamily: 'sans-serif',
				position: 'relative',
				overflow: 'hidden'
			}}
		>
			{/* heat-spectrum bar */}
			<div
				style={{
					display: 'flex',
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					height: '12px',
					background: `linear-gradient(90deg, ${HEAT_SPECTRUM[0]} 0%, ${HEAT_SPECTRUM[1]} 50%, ${HEAT_SPECTRUM[2]} 100%)`
				}}
			/>
			{/* heat glow — grounds the mascot like the site heroes */}
			<div
				style={{
					display: 'flex',
					position: 'absolute',
					top: '-100px',
					right: '-100px',
					width: '500px',
					height: '500px',
					borderRadius: '50%',
					background: `radial-gradient(circle, ${HEAT_SPECTRUM[2]}33 0%, transparent 66%)`
				}}
			/>
			{mascot ? <MascotFigure data={mascot} /> : null}
			<div
				style={{
					display: 'flex',
					fontSize: '24px',
					fontWeight: 700,
					letterSpacing: '0.2em',
					textTransform: 'uppercase',
					color: HEAT_SPECTRUM[2],
					marginBottom: '24px'
				}}
			>
				Grass Volleyball · Tournament Series
			</div>
			<div
				style={{
					display: 'flex',
					fontSize: '128px',
					fontWeight: 900,
					color: '#ffffff',
					lineHeight: '0.86',
					letterSpacing: '-0.03em',
					textTransform: 'uppercase'
				}}
			>
				Let&apos;s Pepper
			</div>
			<div style={{ display: 'flex', flex: 1 }} />
			<div style={{ display: 'flex', fontSize: '34px', fontWeight: 700, color: 'rgba(255,255,255,0.82)', maxWidth: '760px' }}>
				Player-owned. Media-backed. Built to compete.
			</div>
		</div>
	)
}
