/**
 * Damped-spring step response in Apple's (response, bounce) terms.
 * Damping ratio = 1 - bounce; natural frequency = 2 * PI / response.
 */
export interface SpringOptions {
  /** 0 is critically damped; 0.45 overshoots by about 12.6 percent. */
  bounce: number
  /** Time scale of the spring in milliseconds. */
  response: number
}

const MAX_DURATION_MS = 1600

function physics({ bounce, response }: SpringOptions) {
  const zeta = 1 - bounce
  // Radians per second; `response` is in milliseconds.
  const omega = (2 * Math.PI) / (response / 1000)
  return { zeta, omega }
}

/** Progress of a spring released from rest at 0 towards 1 after `t` ms. Can pass 1. */
export function springProgress(t: number, options: SpringOptions): number {
  if (t <= 0) return 0
  const { zeta, omega } = physics(options)
  const seconds = t / 1000
  if (zeta < 1) {
    const damped = omega * Math.sqrt(1 - zeta * zeta)
    const decay = Math.exp(-zeta * omega * seconds)
    return (
      1 -
      decay *
        (Math.cos(damped * seconds) +
          ((zeta * omega) / damped) * Math.sin(damped * seconds))
    )
  }
  return 1 - Math.exp(-omega * seconds) * (1 + omega * seconds)
}

/** Milliseconds until the decay envelope is down to 0.1 percent, capped at 1600. */
export function springDuration(options: SpringOptions): number {
  const { zeta, omega } = physics(options)
  const seconds = zeta < 1 ? 6.9 / (zeta * omega) : 9.2 / omega
  return Math.min(MAX_DURATION_MS, seconds * 1000)
}

/**
 * Samples the spring between two values for Web Animations. Play the result with
 * `easing: 'linear'` over `duration`; the last sample is exactly `to`.
 */
export function springKeyframes(
  from: number,
  to: number,
  options: SpringOptions
): { values: number[]; duration: number } {
  const duration = springDuration(options)
  const steps = Math.max(24, Math.round(duration * 0.09))
  const values = Array.from({ length: steps + 1 }, (_, index) =>
    index === steps
      ? to
      : from + (to - from) * springProgress((index / steps) * duration, options)
  )
  return { values, duration }
}
