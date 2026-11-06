#!/bin/bash

# =============================================================================
# DISTRIBUIDORA ROJAS PERALTA - ACCESO DIRECTO MACBOOK
# =============================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

chmod +x "$DIR"/*.command 2>/dev/null
bash "$DIR/INICIAR_SISTEMA_MAC.command"
