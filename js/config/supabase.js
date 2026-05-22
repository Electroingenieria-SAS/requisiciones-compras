/**
 * ============================================================
 * CONFIGURACIÓN SUPABASE
 * Electroingeniería S.A.S. - Sistema de Requisiciones
 * ============================================================
 * Este archivo centraliza la conexión con Supabase.
 * Todos los demás módulos importan el cliente desde aquí.
 * ============================================================
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── Credenciales del proyecto Supabase ───
// Estos datos son públicos (anon key) y seguros de exponer en frontend.
// La seguridad real la maneja Row Level Security (RLS) en la base de datos.
const SUPABASE_URL = 'https://ckxnhoxdsezapamdiwsc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNreG5ob3hkc2V6YXBhbWRpd3NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzU3OTcsImV4cCI6MjA5NDExMTc5N30.zxYckiyhTiaMNNTdF-rsEeKduIIyC4jM_y_t0loVvU0';

// ─── Crear cliente Supabase ───
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Configuración global de la aplicación ───
export const APP_CONFIG = {
    nombre: 'Requisiciones de Compras Administrativas',
    empresa: 'Electroingeniería S.A.S.',
    version: '1.0.0',
    colores: {
        azul: '#00369C',
        amarillo: '#F6D000',
        gris: '#A4A8AB'
    }
};
