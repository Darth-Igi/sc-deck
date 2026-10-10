import { FormControlLabel, styled, Switch } from '@mui/material'
import { useDeckStore } from '../store'
import { isToggleOn } from '../inputActions'
import { useShipTheme } from '../themes/ShipThemeProvider'
import { themeColor } from '../themes/resolve'
import { HOLD_MS, useTapOrHold } from '../useLongPress'


// `accent` (per-widget color from the config, e.g. a red WPN safety) is a
// styling-only prop and must not leak onto the DOM element.
const ToggleSwitch = styled(Switch, {
  shouldForwardProp: (prop) => prop !== 'accent',
})(({ theme, accent }) => {
  const ship = theme.ship
  const tg = ship.toggle
  const hud = ship.colors
  const c = (v) => themeColor(ship, v)
  const on = accent || c(tg.accent)
  // thumbs are centered in the 44px slot the switchBase provides
  // (border-box sizing: the 2px thumb border is part of the size)
  const offInset = (44 - tg.offThumbSize) / 2
  const onInset = (44 - tg.onThumbSize) / 2
  const trackGlow = tg.glow
    ? `0 0 12px ${hud.glow}, inset 0 0 24px ${hud.innerGlow}`
    : 'none'
  return {
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
          backgroundColor: c(tg.onTrack),
          ...(tg.onTrackBorder ? { borderColor: c(tg.onTrackBorder) } : {}),
          ...theme.applyStyles('dark', {
            backgroundColor: c(tg.onTrack),
          }),
        },
        '& .MuiSwitch-thumb': {
          backgroundColor: on,
          boxShadow: tg.glow ? `0 0 6px 3px ${on}` : 'none',
          borderColor: on,
          width: tg.onThumbSize,
          height: tg.onThumbSize,
          borderRadius: tg.onThumbRadius,
          margin: `${onInset}px 0 0 ${onInset}px`,
        },
      },
    },
    '& .MuiSwitch-thumb': {
      backgroundColor: c(tg.offThumb),
      border: `2px solid ${tg.offThumbBorder ? c(tg.offThumbBorder) : on}`,
      width: tg.offThumbSize,
      height: tg.offThumbSize,
      borderRadius: tg.offThumbRadius,
      margin: `${offInset}px 0 0 ${offInset}px`,
      transition: theme.transitions.create(['width'], {
        duration: 200,
      }),
    },
    '& .MuiSwitch-track': {
      borderRadius: tg.trackRadius,
      border: "1px solid",
      borderColor: c(tg.trackBorder),
      boxShadow: trackGlow,
      opacity: 1,
      backgroundColor: 'rgba(0,0,0,.25)',
      boxSizing: 'border-box',
      transition: theme.transitions.create(['background-color', 'border-color'], {
        duration: ship.transitionMs,
      }),
      ...theme.applyStyles('dark', {
        backgroundColor: 'transparent',
      }),
    },
  }
})


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
  // displayed state: OFF while a "requires" master toggle is off
  const isOn = useDeckStore((s) => isToggleOn(s.toggleStates, widget))
  const hasError = useDeckStore((s) => s.errorId === widget.id)

  const { holding, handlers } = useTapOrHold(
    () => triggerToggle(widget),
    () => correctToggle(widget),
  )

  const ship = useShipTheme()
  const hud = ship.colors
  // config "accent": role name (follows the ship theme) or fixed color
  const accent = themeColor(ship, widget.accent, ship.toggle.accent)

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
