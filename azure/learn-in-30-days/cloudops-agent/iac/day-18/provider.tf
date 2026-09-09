terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "= 2.7.0"
    }
  }
}

provider "azapi" {
  # The sandbox registers Microsoft.DocumentDB before the learner starts.
  skip_provider_registration = true
  use_cli                    = true
}
