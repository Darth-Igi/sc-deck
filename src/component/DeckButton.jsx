import { Button } from "@mui/material";
import { useDeckStore } from "../store";

export default function DeckButton({ button }) {
  const triggerButton = useDeckStore((s) => s.triggerButton);
  const pressed = useDeckStore((s) => s.pressedId === button.id);
  const hasError = useDeckStore((s) => s.errorId === button.id);

  return (
    <Button
      variant="contained"
      disableRipple={false}
      onPointerDown={() => triggerButton(button)} // pointerdown statt onClick: kein Touch-Delay
      sx={{
        height: "100%",
        width: "100%",
        fontSize: "1.1rem",
        color: "#fff",
        backgroundColor: button.color || "#333",
        border: hasError ? "3px solid #ff1744" : "2px solid rgba(255,255,255,0.15)",
        transform: pressed ? "scale(0.95)" : "scale(1)",
        filter: pressed ? "brightness(1.3)" : "none",
        transition: "transform 0.06s ease, filter 0.06s ease",
        "&:hover": {
          backgroundColor: button.color || "#333",
          filter: "brightness(1.1)",
        },
      }}
    >
      {button.label}
    </Button>
  );
}
