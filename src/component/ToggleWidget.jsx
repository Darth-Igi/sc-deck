import { FormControlLabel, styled, Switch } from '@mui/material'
import { useDeckStore } from '../store'
import { hud } from '../theme'
import { HOLD_MS, useTapOrHold } from '../useLongPress'


// `accent` (per-widget color from the config, e.g. a red WPN safety) is a
// styling-only prop and must not leak onto the DOM element.
const ToggleSwitch = styled(Switch, {
  shouldForwardProp: (prop) => prop !== 'accent',
})(({ theme, accent = hud.active }) => ({
  width: 96,
  height: 48,
  padding: 0,
  display: 'flex',
  '&:active': {
    '& .MuiSwitch-thumb': {
      width: 56,
    },
    '& .MuiSwitch-switchBase.Mui-checked': {
      transform: 'translateX(18px)',
    },
  },
  '& .MuiSwitch-switchBase': {
    padding: 2,
    '&.Mui-checked': {
      transform: 'translateX(48px)', // active position
      '& + .MuiSwitch-track': {
        opacity: 1,
        backgroundColor: 'transparent',
        ...theme.applyStyles('dark', {
          backgroundColor: 'transparent',
        }),
      },
      '& .MuiSwitch-thumb': {
        backgroundColor: accent,
        boxShadow: `0 0 6px 3px ${accent}`,
        width: 40,
        height: 40,
        borderRadius: 20,
        margin: '2px 0 0 2px',
      },
    },
  },
  '& .MuiSwitch-thumb': {
    backgroundColor: hud.glow,
    border: `2px solid ${accent}`,
    width: 44,
    height: 44,
    borderRadius: 22,
    transition: theme.transitions.create(['width'], {
      duration: 200,
    }),
  },
  '& .MuiSwitch-track': {
    borderRadius: 48 / 2,
    border: "1px solid",
    borderColor: hud.line,
    boxShadow: `0 0 12px ${hud.glow}, inset 0 0 24px rgba(87,217,255,0.05)`,
    opacity: 1,
    backgroundColor: 'rgba(0,0,0,.25)',
    boxSizing: 'border-box',
    ...theme.applyStyles('dark', {
      backgroundColor: 'transparent',
    }),
  },
}))


// Toggle styled after the ON/OFF switches in the cockpit (WPN, HEAT,
// OVRCLK). Note: the state is purely local ("assumed") - the game does not
// report anything back.
//
// Interaction (changed for the long-press correction feature):
// - TAP (release before HOLD_MS): send keys + flip assumed state. Fires on
//   pointerUP now, not pointerdown - hold detection needs the release.
//   Slightly more latency than the momentary buttons, accepted trade-off.
// - HOLD (>= HOLD_MS): flip the assumed state WITHOUT sending keys -
//   manual drift correction (ship power-off, physical keyboard presses).
//   While holding, the track charges amber (same color language as the
//   reset button in the nav bar).
// The handlers sit on the FormControlLabel so the label text works too.
// The Switch itself is fully controlled (checked from the store, noop
// onChange - the click after our pointer events must not toggle again).
export default function ToggleWidget({ widget }) {
  const triggerToggle = useDeckStore((s) => s.triggerToggle)
  const correctToggle = useDeckStore((s) => s.correctToggle)
  const isOn = useDeckStore((s) => Boolean(s.toggleStates[widget.id]))
  const hasError = useDeckStore((s) => s.errorId === widget.id)

  const { holding, handlers } = useTapOrHold(
    () => triggerToggle(widget),
    () => correctToggle(widget),
  )

  const accent = widget.accent || hud.active

  // Error beats holding: a failed dispatch must stay visible even while
  // the user is already pressing again.
  const trackSx = hasError
    ? {
        '& .MuiSwitch-track': {
          borderColor: hud.danger,
          boxShadow: `0 0 12px ${hud.danger}`,
        },
      }
    : holding
      ? {
          '& .MuiSwitch-track': {
            borderColor: hud.warn,
            boxShadow: `0 0 12px ${hud.warn}`,
            transition: `box-shadow ${HOLD_MS}ms ease-in, border-color ${HOLD_MS}ms ease-in`,
          },
        }
      : undefined

  return (
    <FormControlLabel
      {...handlers}
      control={<ToggleSwitch
        checked={isOn}
        onChange={() => {}}
        accent={accent}
        sx={trackSx}
      />}
      label={widget.label}
      labelPlacement="bottom"
    />
  )
}
