#!/bin/bash
# ChromeOS setup script for Parent Buddy extension persistence
# Run this in a ChromeOS shell (crosh -> shell) or via SSH with sudo

set -e

EXTENSION_ID="dkfkbcaieniginjodcnbjfjcihdkojng"
UPDATE_URL="https://raw.githubusercontent.com/zameerb1/parent-buddy-extension/master/updates.xml"
POLICY_DIR="/etc/opt/chrome/policies/managed"
POLICY_FILE="${POLICY_DIR}/parent-buddy.json"

echo "Setting up Parent Buddy extension for ChromeOS..."

# Create policy directory if it doesn't exist
sudo mkdir -p "$POLICY_DIR"

# Create the force-install policy
sudo tee "$POLICY_FILE" > /dev/null <<POLICY
{
  "ExtensionInstallForcelist": [
    "${EXTENSION_ID};${UPDATE_URL}"
  ],
  "ExtensionSettings": {
    "${EXTENSION_ID}": {
      "installation_mode": "force_installed",
      "update_url": "${UPDATE_URL}",
      "toolbar_pin": "force_pinned"
    }
  }
}
POLICY

echo "Policy installed at ${POLICY_FILE}"
echo "Restart Chrome for the policy to take effect."
echo ""
echo "To verify: open chrome://policy and look for ExtensionInstallForcelist"
