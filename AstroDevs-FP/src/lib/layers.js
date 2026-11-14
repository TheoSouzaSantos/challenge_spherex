// AI-Assisted: the layer factory generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * A layer = one detector at one moment in time (or following the timeline), with its own
 * color and contrast. The "Then vs now" preset is just two layers of the same band at two dates.
 */
let nextLayerId = 1

export const makeLayer = (det, opts = {}) => ({
  id: nextLayerId++, det, epoch: 'follow', visible: true, opacity: 1,
  black: 0, white: 255, gamma: 1, color: '#ffffff', ...opts,
})
