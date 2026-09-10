terraform {
  required_version = ">= 1.9.0, < 2.0.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 5.2.0"
    }
  }
}

provider "azurerm" {
  features {}
  # The sandbox already registers the services used by this exercise.
  resource_provider_registrations = "none"
  use_cli                         = true
}
