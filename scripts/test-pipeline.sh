#!/usr/bin/env bash
# Script simple para probar pipeline localmente usando Stripe CLI
# Requiere: stripe CLI instalado y conectado (stripe login)

set -euo pipefail

echo "Triggering checkout.session.completed fixture via Stripe CLI..."
stripe trigger checkout.session.completed

echo "Done. Revisa /pipelines o los logs del servidor para ver el estado."
