/*
  Config apply policy. Pure, Arduino-free, host-testable.

  A new configuration is only applied while the device is idle. Applying it
  during a countdown would change the window under an active alert; applying it
  while alerting would change the retry interval mid-SOS. The queued object
  waits for Idle and is then applied atomically.
*/
#pragma once

#include "safety.h"

namespace fw {

inline bool canApplyConfig(AlertState state) { return state == AlertState::Idle; }

}  // namespace fw
