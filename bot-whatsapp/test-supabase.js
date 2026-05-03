// Explorar comandos_personalizados
require('dotenv').config({ path: __dirname + '/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
    // Intentar insertar en comandos_personalizados con diferentes campos
    console.log('=== Intentando insert en comandos_personalizados ===');
    
    const tests = [
        { comando: 'test1', empresa_id: 1 },
        { comando: 'test2', empresa_id: 1, descripcion: 'test' },
        { comando: 'test3', empresa_id: 1, tipo: 'simple' },
    ];
    
    for (const t of tests) {
        const { data, error } = await supabase.from('comandos_personalizados').insert(t).select();
        if (error) {
            console.log(`❌ Con ${JSON.stringify(t)}: ${error.message}`);
        } else {
            console.log(`✅ Con ${JSON.stringify(t)}:`, JSON.stringify(data[0]));
            // Limpiar
            await supabase.from('comandos_personalizados').delete().eq('id', data[0].id);
        }
    }
}

main().catch(console.error);
