#!/usr/bin/env node

/**
 * INVOICEFLOW — Deploy Automático a GitHub
 * 
 * Uso:
 *   node scripts/deploy-github.js
 * 
 * Este script automatiza TODO el proceso de subir el proyecto a GitHub:
 *   1. Verifica Git instalado
 *   2. Configura usuario/email de Git
 *   3. Inicializa repositorio (git init)
 *   4. Crea .gitignore
 *   5. git add . && git commit
 *   6. Renombra rama a main
 *   7. Agrega remoto origin
 *   8. git push -u origin main
 *   9. Manejo de errores con instrucciones claras
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const REPO_URL = 'https://github.com/sleimanjesus/invoiceflow-bot.git';
const DEFAULT_USER = 'sleimanjesus';
const BRANCH_NAME = 'main';
const COMMIT_MESSAGE = 'Primer commit - InvoiceFlow Bot WhatsApp';

// ─── COLORES PARA CONSOLA ───────────────────────────────────
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m'
};

function log(msg, color = '') {
    console.log(`${color}${msg}${colors.reset}`);
}

function logStep(num, msg) {
    console.log(`\n${colors.cyan}${colors.bold}[Paso ${num}]${colors.reset} ${msg}`);
}

function logSuccess(msg) {
    console.log(`  ${colors.green}✅ ${msg}${colors.reset}`);
}

function logError(msg) {
    console.log(`  ${colors.red}❌ ${msg}${colors.reset}`);
}

function logWarn(msg) {
    console.log(`  ${colors.yellow}⚠️  ${msg}${colors.reset}`);
}

function logInfo(msg) {
    console.log(`  ${colors.dim}ℹ️  ${msg}${colors.reset}`);
}

// ─── READLINE PARA INPUT DEL USUARIO ────────────────────────
function pregunta(pregunta) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(pregunta, respuesta => {
            rl.close();
            resolve(respuesta.trim());
        });
    });
}

// ─── EJECUTAR COMANDO ───────────────────────────────────────
function ejecutar(comando, opciones = {}) {
    try {
        const output = execSync(comando, {
            encoding: 'utf-8',
            stdio: opciones.silent ? 'pipe' : 'pipe',
            ...opciones
        });
        return { success: true, output: output?.trim() || '' };
    } catch (error) {
        return {
            success: false,
            output: error.stdout?.trim() || '',
            error: error.stderr?.trim() || error.message
        };
    }
}

// ─── BANNER ─────────────────────────────────────────────────
function mostrarBanner() {
    console.log(`
${colors.cyan}${colors.bold}    ╔══════════════════════════════════════════════╗
    ║     INVOICEFLOW — Deploy a GitHub          ║
    ║     Automatización completa                 ║
    ╚══════════════════════════════════════════════╝${colors.reset}
    `);
}

// ─── PASO 1: VERIFICAR GIT ──────────────────────────────────
async function paso1() {
    logStep(1, 'Verificando Git...');

    const result = ejecutar('git --version');
    if (!result.success) {
        logError('Git no está instalado.');
        logInfo('Instálalo desde: https://git-scm.com/download/win');
        logInfo('O ejecuta: winget install --id Git.Git -e --source winget');
        return false;
    }

    logSuccess(`Git detectado: ${result.output}`);
    return true;
}

// ─── PASO 2: CONFIGURAR USUARIO Y EMAIL ─────────────────────
async function paso2() {
    logStep(2, 'Configurando usuario y email de Git...');

    // Verificar si ya están configurados
    const userResult = ejecutar('git config --global user.name', { silent: true });
    const emailResult = ejecutar('git config --global user.email', { silent: true });

    let userName = userResult.success ? userResult.output : '';
    let userEmail = emailResult.success ? emailResult.output : '';

    // Intentar leer del .env
    const envPath = path.join(__dirname, '..', 'bot-whatsapp', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const emailMatch = envContent.match(/GIT_EMAIL=["']?([^"'\n]+)["']?/);
        if (emailMatch && !userEmail) {
            userEmail = emailMatch[1];
        }
    }

    if (!userName) {
        userName = await pregunta(`  ${colors.yellow}Ingresa tu nombre de usuario de Git (default: ${DEFAULT_USER}):${colors.reset} `);
        if (!userName) userName = DEFAULT_USER;
    } else {
        logInfo(`Usuario configurado: ${userName}`);
    }

    if (!userEmail) {
        userEmail = await pregunta(`  ${colors.yellow}Ingresa tu email de Git (ej: sleimanjesus@gmail.com):${colors.reset} `);
        while (!userEmail || !userEmail.includes('@')) {
            logWarn('Debes ingresar un email válido.');
            userEmail = await pregunta(`  ${colors.yellow}Ingresa tu email de Git:${colors.reset} `);
        }
    } else {
        logInfo(`Email configurado: ${userEmail}`);
    }

    // Configurar globalmente
    ejecutar(`git config --global user.name "${userName}"`);
    ejecutar(`git config --global user.email "${userEmail}"`);

    logSuccess(`Usuario: ${userName}`);
    logSuccess(`Email: ${userEmail}`);
    return true;
}

// ─── PASO 3: INICIALIZAR REPOSITORIO ────────────────────────
async function paso3() {
    logStep(3, 'Inicializando repositorio Git...');

    const gitDir = path.join(__dirname, '..', '.git');
    if (fs.existsSync(gitDir)) {
        logWarn('El repositorio ya está inicializado.');
        const respuesta = await pregunta(`  ${colors.yellow}¿Deseas reiniciarlo? (s/N):${colors.reset} `);
        if (respuesta.toLowerCase() === 's') {
            fs.rmSync(gitDir, { recursive: true, force: true });
            const result = ejecutar('git init', { cwd: path.join(__dirname, '..') });
            if (!result.success) {
                logError(`Error al inicializar: ${result.error}`);
                return false;
            }
            logSuccess('Repositorio reinicializado.');
        } else {
            logInfo('Usando repositorio existente.');
        }
    } else {
        const result = ejecutar('git init', { cwd: path.join(__dirname, '..') });
        if (!result.success) {
            logError(`Error al inicializar: ${result.error}`);
            return false;
        }
        logSuccess('Repositorio inicializado.');
    }
    return true;
}

// ─── PASO 4: CREAR .gitignore ───────────────────────────────
async function paso4() {
    logStep(4, 'Creando .gitignore...');

    const gitignorePath = path.join(__dirname, '..', '.gitignore');
    const gitignoreContent = `# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Sesiones de WhatsApp
sessions/
auth_*
*.json

# Entorno
.env
.env.local
.env.*.local

# Logs
logs/
*.log

# Sistema
.DS_Store
Thumbs.db
*.swp
*.swo

# IDE
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Build
dist/
build/
*.tsbuildinfo

# Uploads temporales
data/uploads/*
!data/uploads/.gitkeep

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
env.bak/
venv.bak/

# Unity (si está en el mismo proyecto)
Library/
Temp/
Logs/
UserSettings/
`;

    fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
    logSuccess('.gitignore creado con las exclusiones necesarias.');
    return true;
}

// ─── PASO 5: GIT ADD Y COMMIT ───────────────────────────────
async function paso5() {
    logStep(5, 'Agregando archivos y haciendo commit...');

    // git add .
    const addResult = ejecutar('git add .', { cwd: path.join(__dirname, '..') });
    if (!addResult.success) {
        logError(`Error en git add: ${addResult.error}`);
        return false;
    }
    logSuccess('Archivos agregados al staging.');

    // Verificar si hay cambios para commit
    const statusResult = ejecutar('git status --porcelain', { cwd: path.join(__dirname, '..') });
    if (!statusResult.output) {
        logWarn('No hay cambios para commitear.');
        const respuesta = await pregunta(`  ${colors.yellow}¿Deseas forzar un commit vacío? (s/N):${colors.reset} `);
        if (respuesta.toLowerCase() === 's') {
            const commitResult = ejecutar(`git commit --allow-empty -m "${COMMIT_MESSAGE}"`, { cwd: path.join(__dirname, '..') });
            if (!commitResult.success) {
                logError(`Error en commit: ${commitResult.error}`);
                return false;
            }
        } else {
            logInfo('Omitiendo commit.');
            return true;
        }
    } else {
        // git commit
        const commitResult = ejecutar(`git commit -m "${COMMIT_MESSAGE}"`, { cwd: path.join(__dirname, '..') });
        if (!commitResult.success) {
            // Puede que no haya cambios
            if (commitResult.output.includes('nothing to commit') || commitResult.error?.includes('nothing to commit')) {
                logWarn('No hay cambios para commitear.');
                return true;
            }
            logError(`Error en commit: ${commitResult.error || commitResult.output}`);
            return false;
        }
    }

    logSuccess(`Commit creado: "${COMMIT_MESSAGE}"`);
    return true;
}

// ─── PASO 6: RENOMBRAR RAMA A MAIN ──────────────────────────
async function paso6() {
    logStep(6, `Renombrando rama a '${BRANCH_NAME}'...`);

    const result = ejecutar(`git branch -M ${BRANCH_NAME}`, { cwd: path.join(__dirname, '..') });
    if (!result.success) {
        logError(`Error al renombrar rama: ${result.error}`);
        return false;
    }

    logSuccess(`Rama renombrada a '${BRANCH_NAME}'.`);
    return true;
}

// ─── PASO 7: AGREGAR REMOTO ORIGIN ──────────────────────────
async function paso7() {
    logStep(7, 'Configurando remoto origin...');

    // Verificar si ya existe el remoto
    const remoteResult = ejecutar('git remote get-url origin', { cwd: path.join(__dirname, '..'), silent: true });

    if (remoteResult.success) {
        logInfo(`Remoto existente: ${remoteResult.output}`);
        if (remoteResult.output !== REPO_URL) {
            logWarn(`El remoto actual es diferente al esperado.`);
            const respuesta = await pregunta(`  ${colors.yellow}¿Actualizar a ${REPO_URL}? (S/n):${colors.reset} `);
            if (respuesta.toLowerCase() !== 'n') {
                const setResult = ejecutar(`git remote set-url origin ${REPO_URL}`, { cwd: path.join(__dirname, '..') });
                if (!setResult.success) {
                    logError(`Error al actualizar remoto: ${setResult.error}`);
                    return false;
                }
                logSuccess(`Remoto actualizado a: ${REPO_URL}`);
            } else {
                logInfo('Manteniendo remoto actual.');
            }
        } else {
            logSuccess('Remoto ya configurado correctamente.');
        }
    } else {
        const addResult = ejecutar(`git remote add origin ${REPO_URL}`, { cwd: path.join(__dirname, '..') });
        if (!addResult.success) {
            logError(`Error al agregar remoto: ${addResult.error}`);
            return false;
        }
        logSuccess(`Remoto agregado: ${REPO_URL}`);
    }

    return true;
}

// ─── PASO 8: GIT PUSH ───────────────────────────────────────
async function paso8() {
    logStep(8, 'Subiendo a GitHub...');

    logInfo(`Repositorio: ${REPO_URL}`);
    logInfo(`Rama: ${BRANCH_NAME}`);
    console.log('');

    // Intentar push
    const pushResult = ejecutar(`git push -u origin ${BRANCH_NAME}`, {
        cwd: path.join(__dirname, '..'),
        silent: true
    });

    if (pushResult.success) {
        logSuccess('¡Código subido exitosamente a GitHub!');
        return true;
    }

    // Analizar el error
    const errorMsg = (pushResult.error + ' ' + pushResult.output).toLowerCase();

    if (errorMsg.includes('authentication') || errorMsg.includes('403') || errorMsg.includes('401') || errorMsg.includes('could not read')) {
        logError('Error de autenticación.');
        console.log(`
${colors.yellow}${colors.bold}  🔑 Necesitas un token de acceso personal de GitHub.${colors.reset}

  Sigue estos pasos:

  1. Ve a: ${colors.cyan}https://github.com/settings/tokens${colors.reset}
  2. Haz clic en ${colors.bold}"Generate new token (classic)"${colors.reset}
  3. Dale un nombre (ej: "invoiceflow-deploy")
  4. Selecciona el scope: ${colors.bold}repo${colors.reset}
  5. Haz clic en ${colors.bold}"Generate token"${colors.reset}
  6. ${colors.red}${colors.bold}COPIA EL TOKEN AHORA${colors.reset} (no podrás verlo después)

  Luego, cuando te pida usuario, ingresa: ${colors.cyan}${DEFAULT_USER}${colors.reset}
  Y cuando te pida contraseña, ${colors.bold}PEGA EL TOKEN${colors.reset} (no se mostrará mientras escribes).
        `);

        const respuesta = await pregunta(`  ${colors.yellow}¿Ya tienes el token listo? Presiona ENTER para continuar...${colors.reset}`);

        // Segundo intento con posible input manual
        console.log('');
        logInfo('Ejecutando git push...');
        logInfo(`Usuario: ${DEFAULT_USER}`);
        logInfo('Cuando pida contraseña, pega tu token de GitHub.');
        console.log('');

        return new Promise((resolve) => {
            const child = exec(`git push -u origin ${BRANCH_NAME}`, {
                cwd: path.join(__dirname, '..')
            }, (error, stdout, stderr) => {
                if (error) {
                    logError(`Error en push: ${stderr || error.message}`);
                    logInfo('Si sigues teniendo problemas, prueba:');
                    logInfo(`1. git remote set-url origin https://${DEFAULT_USER}@github.com/sleimanjesus/invoiceflow-bot.git`);
                    logInfo('2. Vuelve a ejecutar este script');
                    resolve(false);
                } else {
                    logSuccess('¡Código subido exitosamente a GitHub!');
                    resolve(true);
                }
            });

            child.stdout.on('data', (data) => {
                process.stdout.write(`  ${data}`);
            });

            child.stderr.on('data', (data) => {
                process.stderr.write(`  ${data}`);
            });
        });
    }

    if (errorMsg.includes('repository not found') || errorMsg.includes('404')) {
        logError('El repositorio no existe en GitHub.');
        console.log(`
${colors.yellow}  Crea el repositorio manualmente:${colors.reset}

  1. Ve a: ${colors.cyan}https://github.com/new${colors.reset}
  2. Nombre: ${colors.bold}invoiceflow-bot${colors.reset}
  3. Visibilidad: ${colors.bold}Private${colors.reset} o ${colors.bold}Public${colors.reset}
  4. NO marques "Initialize this repository with a README"
  5. Haz clic en ${colors.bold}"Create repository"${colors.reset}

  Luego vuelve a ejecutar este script.
        `);
        return false;
    }

    if (errorMsg.includes('failed to push') || errorMsg.includes('non-fast-forward')) {
        logError('El remoto tiene commits que no están en tu local.');
        logInfo('Solución: git pull --rebase origin main && vuelve a ejecutar');
        return false;
    }

    // Error genérico
    logError(`Error al hacer push: ${pushResult.error || pushResult.output}`);
    logInfo('Revisa la conexión a internet y los permisos del repositorio.');
    return false;
}

// ─── PASO 9: MOSTRAR RESUMEN ────────────────────────────────
function paso9(exito) {
    console.log(`\n${colors.bold}${'═'.repeat(55)}${colors.reset}`);
    if (exito) {
        console.log(`${colors.green}${colors.bold}
    🎉  ¡DEPLOY COMPLETADO CON ÉXITO!  🎉${colors.reset}`);
        console.log(`
    ${colors.green}📦 Repositorio:${colors.reset} ${REPO_URL}
    ${colors.green}🌿 Rama:${colors.reset} ${BRANCH_NAME}
    ${colors.green}💻 Comando:${colors.reset} git push -u origin ${BRANCH_NAME}
        `);
    } else {
        console.log(`${colors.red}${colors.bold}
    ❌  DEPLOY FALLÓ  ❌${colors.reset}`);
        console.log(`
    ${colors.yellow}Revisa los errores arriba y vuelve a intentarlo.${colors.reset}
    ${colors.yellow}Si el problema persiste, ejecuta manualmente:${colors.reset}
      git push -u origin ${BRANCH_NAME}
        `);
    }
    console.log(`${colors.bold}${'═'.repeat(55)}${colors.reset}\n`);
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
    mostrarBanner();

    const pasos = [
        { nombre: 'Verificar Git', fn: paso1 },
        { nombre: 'Configurar usuario/email', fn: paso2 },
        { nombre: 'Inicializar repositorio', fn: paso3 },
        { nombre: 'Crear .gitignore', fn: paso4 },
        { nombre: 'Git add + commit', fn: paso5 },
        { nombre: 'Renombrar rama a main', fn: paso6 },
        { nombre: 'Configurar remoto origin', fn: paso7 },
        { nombre: 'Git push a GitHub', fn: paso8 }
    ];

    let exito = true;

    for (let i = 0; i < pasos.length; i++) {
        const paso = pasos[i];
        try {
            const resultado = await paso.fn();
            if (!resultado) {
                logError(`Paso ${i + 1} (${paso.nombre}) falló.`);
                const respuesta = await pregunta(`  ${colors.yellow}¿Deseas continuar con el siguiente paso? (s/N):${colors.reset} `);
                if (respuesta.toLowerCase() !== 's') {
                    exito = false;
                    break;
                }
            }
        } catch (err) {
            logError(`Error inesperado en paso ${i + 1}: ${err.message}`);
            exito = false;
            break;
        }
    }

    paso9(exito);

    if (exito) {
        console.log(`${colors.green}${colors.bold}  🚀  Visita tu repositorio en:${colors.reset}`);
        console.log(`  ${colors.cyan}${REPO_URL}${colors.reset}\n`);
    }

    process.exit(exito ? 0 : 1);
}

main();
