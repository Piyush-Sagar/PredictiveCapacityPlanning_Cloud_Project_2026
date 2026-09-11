import { Hourglass, Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function GuardrailStatus({
  hysteresisActive,
  cooldownRemainingSec,
}: {
  hysteresisActive: boolean;
  cooldownRemainingSec: number;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-transparent",
          hysteresisActive ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        <Waves className="size-3" />
        {hysteresisActive ? "Hysteresis on" : "Hysteresis off"}
      </Badge>
      {cooldownRemainingSec > 0 && (
        <Badge variant="outline" className="gap-1 border-transparent bg-muted text-muted-foreground">
          <Hourglass className="size-3" />
          {Math.round(cooldownRemainingSec / 60)}m cooldown
        </Badge>
      )}
    </div>
  );
}
