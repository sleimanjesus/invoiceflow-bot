/**
 * INVOICEFLOW — Cliente Supabase
 * 
 * Singleton del cliente @supabase/supabase-js.
 * Lee SUPABASE_URL y SUPABASE_KEY desde el .env.
 * 
 * Uso:
 *   const supabase = require('./src/db/supabase');
 *   const { data, error } = await supabase.from('empresas').select('*');
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Cargar variables de entorno
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'bot-whatsapp', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let cliente = null;

/**
 * Obtiene la instancia del cliente Supabase (singleton)
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabase() {
    if (!cliente) {
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            throw new Error(
                '❌ ERROR: Debes configurar SUPABASE_URL y SUPABASE_KEY en bot-whatsapp/.env\n' +
                '  1. Crea un proyecto en https://supabase.com\n' +
                '  2. Ve a Project Settings > API\n' +
                '  3. Copia la URL y anon/public key al archivo .env'
            );
        }
        cliente = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return cliente;
}

/**
 * Verifica la conexión a Supabase
 */
async function testConnection() {
    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('empresas').select('count', { count: 'exact', head: true });
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('❌ Error de conexión a Supabase:', err.message);
        return false;
    }
}

module.exports = { getSupabase, testConnection };
