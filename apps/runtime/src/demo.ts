import { validLiveSessionSpec, validRuntimeEvents } from "@liveseller/contracts";
import { routeRuntimeEvent } from "./runtime";
import { summarizeStream } from "./postStream";

const routed = validRuntimeEvents.map((event) => routeRuntimeEvent(event, validLiveSessionSpec));
const auditEvents = routed.flatMap((result) => result.auditEvents);

console.log(
  JSON.stringify(
    {
      actions: routed.flatMap((result) =>
        result.actions.map((action) => ({
          type: action.type,
          risk: action.risk,
          requiresApproval: action.requiresApproval,
          reason: action.reason
        }))
      ),
      overlayState: routed.at(-1)?.overlayState,
      summary: summarizeStream(validLiveSessionSpec, auditEvents)
    },
    null,
    2
  )
);
