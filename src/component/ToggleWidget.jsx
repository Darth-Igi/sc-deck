import { Box, FormControlLabel, styled, Switch, Typography } from '@mui/material'
import { useDeckStore } from './../store'
import { hud } from './../theme'


const ToggleSwitch = styled(Switch)(({ theme }) => ({
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
        backgroundColor: hud.active,
        boxShadow: `0 0 6px 3px ${hud.active}`,
        width: 40,
        height: 40,
        borderRadius: 20,
        margin: '2px 0 0 2px',
      },
    },
  },
  '& .MuiSwitch-thumb': {
    backgroundColor: hud.glow,
    border: `2px solid ${hud.active}`,
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
// OVRCLK): pill button that stays filled while on, with an ON/OFF label
// below. Note: the state is purely local ("assumed") - the game does not
// report anything back.
export default function ToggleWidget({ widget }) {
  const triggerToggle = useDeckStore((s) => s.triggerToggle)
  const isOn = useDeckStore((s) => Boolean(s.toggleStates[widget.id]))
  // const pressed = useDeckStore((s) => s.pressedId === widget.id);
  const hasError = useDeckStore((s) => s.errorId === widget.id)

  const accent = widget.accent || hud.active

  return (
    <FormControlLabel
      control={<ToggleSwitch
        checked={isOn}
        onChange={() => triggerToggle(widget)}
      />}
      label={widget.label}
      labelPlacement="bottom"
    />


    // <Box
    //   onPointerDown={() => triggerToggle(widget)}
    //   sx={{
    //     display: "flex",
    //     flexDirection: "column",
    //     alignItems: "center",
    //     gap: 0.4,
    //     userSelect: "none",
    //     cursor: "pointer",
    //   }}
    // >
    //   <Box
    //     sx={{
    //       width: "100%",
    //       minHeight: 44,
    //       borderRadius: "22px",
    //       display: "flex",
    //       alignItems: "center",
    //       justifyContent: "center",
    //       border: hasError
    //         ? `2px solid ${hud.danger}`
    //         : `1.5px solid ${isOn ? accent : hud.lineDim}`,
    //       background: isOn ? accent : "rgba(87, 217, 255, 0.06)",
    //       color: isOn ? hud.activeText : hud.text,
    //       fontSize: "0.85rem",
    //       fontWeight: 700,
    //       letterSpacing: "0.12em",
    //       textTransform: "uppercase",
    //       boxShadow: isOn ? `0 0 14px ${accent}` : "none",
    //       transform: pressed ? "scale(0.95)" : "scale(1)",
    //       transition:
    //         "background 0.1s ease, box-shadow 0.1s ease, transform 0.06s ease",
    //       px: 1,
    //       textAlign: "center",
    //     }}
    //   >
    //     {widget.label}
    //   </Box>
    //   <Typography
    //     sx={{
    //       fontSize: "0.55rem",
    //       letterSpacing: "0.2em",
    //       color: isOn ? accent : hud.textDim,
    //       fontWeight: 600,
    //     }}
    //   >
    //     {isOn ? "ON" : "OFF"}
    //   </Typography>
    // </Box>
  )
}
