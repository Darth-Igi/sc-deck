import { FormControlLabel, styled, Switch } from '@mui/material'
import { useDeckStore } from '../store'
import { hud } from '../theme'


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
// Triggered on POINTERDOWN (like the momentary buttons), not onChange:
// onChange rides on the click event, which can add touch latency and was
// inconsistent with the rest of the deck. The handler sits on the
// FormControlLabel so a tap on the label text works too. The Switch itself
// is fully controlled (checked from the store, noop onChange - the click
// that follows our pointerdown must not toggle a second time).
export default function ToggleWidget({ widget }) {
  const triggerToggle = useDeckStore((s) => s.triggerToggle)
  const isOn = useDeckStore((s) => Boolean(s.toggleStates[widget.id]))
  const hasError = useDeckStore((s) => s.errorId === widget.id)

  const accent = widget.accent || hud.active

  return (
    <FormControlLabel
      onPointerDown={() => triggerToggle(widget)}
      control={<ToggleSwitch
        checked={isOn}
        onChange={() => {}}
        accent={accent}
        // Error feedback got lost in the Box->Switch redesign: make a
        // failed hotkey dispatch visible on the widget itself again
        sx={hasError ? {
          '& .MuiSwitch-track': {
            borderColor: hud.danger,
            boxShadow: `0 0 12px ${hud.danger}`,
          },
        } : undefined}
      />}
      label={widget.label}
      labelPlacement="bottom"
    />
  )
}
