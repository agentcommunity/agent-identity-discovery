terraform {
  required_version = ">= 1.3.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# Provider config expects `CLOUDFLARE_API_TOKEN` env var supplied via GitHub Actions secret
provider "cloudflare" {}

########################
# Variables
########################

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the apex domain (agentcommunity.org). Get this from the Cloudflare dashboard → zone overview after adding the zone."
  type        = string
}

# TTL parameterization. Per spec §4, 300–900 seconds is recommended; default 360.
variable "record_ttl" {
  description = "TTL for DNS TXT records at _agent.<domain>. Recommended 300–900 seconds; default 360."
  type        = number
  default     = 360
}

# Optional: include protocol-specific subdomain examples like _agent._mcp.<sub> and _agent._a2a.<sub>.
# These are NOT canonical; base `_agent.<domain>` remains primary. See spec §2.4.
variable "include_protocol_specific" {
  description = "If true, also create protocol-specific example records at _agent._<proto>.<sub>." 
  type        = bool
  default     = false
}

########################
# Generated examples from protocol/examples.yml
########################

# Include the generated examples file
locals {
  # Records are now generated from protocol/examples.yml via 'pnpm gen'
  # See examples.tf for the individual record definitions

  # We will define the common prefix here to keep the records clean
  record_prefix = "_agent"

  # Optional protocol-specific examples (underscore form). See spec §2.4.
  # These demonstrate exposing multiple distinct services. They are NOT the default.
  protocol_specific_records = {
    mcp_simple = {
      name  = "${local.record_prefix}._mcp.simple"
      value = "v=aid1;uri=https://api.example.com/mcp;p=mcp;desc=Example via protocol-specific subdomain (optional)"
    }
    a2a_gateway = {
      name  = "${local.record_prefix}._a2a.gateway"
      value = "v=aid1;uri=https://a2a.example.com/ping;p=a2a;desc=A2A gateway (optional)"
    }
  }

  # Final set: generated examples by default; merge optional protocol-specific examples when enabled
  # The all_examples map is generated in examples.tf
  records = var.include_protocol_specific ? merge(local.all_examples, local.protocol_specific_records) : local.all_examples
}

# Iterate and create DNS TXT records
resource "cloudflare_record" "showcase" {
  for_each = local.records

  # Cloudflare zone ID (not the apex domain string — CF uses zone IDs)
  zone_id = var.cloudflare_zone_id

  # The 'name' is the subdomain part (e.g. _agent.simple)
  name = each.value.name

  type  = "TXT"
  value = each.value.value
  ttl   = var.record_ttl
}