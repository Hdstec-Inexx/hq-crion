import {
  motivoUltimoAdmin,
  papelSchema,
  perfilComIdSchema,
  perfilSchema,
  type MotivoUltimoAdmin,
  type Perfil,
  type PerfilComId
} from '@hq-crion/contracts/perfil';
import { randomUUID } from 'node:crypto';
import type { ClienteSql } from '../../db/cliente.js';
import { hashDaSenha } from './senha.js';

export type RegistroDePerfil = PerfilComId & { senha: string; versao: number };

export const perfisDaSemente: readonly RegistroDePerfil[] = [
  {
    id: 'perfil-ana',
    nome: 'Ana Souza',
    email: 'ana.souza@crion',
    papel: 'Gestão',
    senha: hashDaSenha('crion-hq'),
    ativo: true,
    versao: 1
  },
  {
    id: 'perfil-carla',
    nome: 'Carla Mendes',
    email: 'carla.mendes@crion',
    papel: 'Curador',
    senha: hashDaSenha('crion-hq'),
    ativo: true,
    versao: 1
  },
  {
    id: 'perfil-bruno',
    nome: 'Bruno Alves',
    email: 'bruno.alves@crion',
    papel: 'Admin',
    senha: hashDaSenha('crion-hq'),
    ativo: true,
    versao: 1
  }
];

const registros: RegistroDePerfil[] = perfisDaSemente.map((perfil) => ({ ...perfil }));

let deposito: ClienteSql | null = null;

export function usarDepositoDePerfis(cliente: ClienteSql | null) {
  deposito = cliente;
}

export async function lerPerfisDoDeposito(cliente: ClienteSql) {
  const resultado = await cliente.query(
    'SELECT id, nome, email, senha, papel, ativo, versao FROM hq_perfil'
  );
  const linhas = resultado.rows as Array<{
    id: string;
    nome: string;
    email: string;
    senha: string;
    papel: string;
    ativo: boolean;
    versao: number | string;
  }>;

  if (linhas.length === 0) {
    throw new Error('O depósito não tem Perfil semeado.');
  }

  return linhas.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    senha: linha.senha,
    papel: papelSchema.parse(linha.papel),
    ativo: linha.ativo,
    versao: Number(linha.versao)
  }));
}

export function aplicarPerfis(perfis: RegistroDePerfil[]) {
  registros.splice(0, registros.length, ...perfis.map((perfil) => ({ ...perfil })));
}

async function gravarPerfil(
  texto: string,
  valores: unknown[],
  recusaUltimoAdmin: boolean
) {
  if (!deposito) {
    return;
  }

  const gravado = await deposito.query(texto, valores);

  if (gravado.rowCount) {
    return;
  }

  if (recusaUltimoAdmin) {
    return motivoUltimoAdmin;
  }

  throw new Error('O Perfil não está no depósito.');
}

const guardaDoUltimoAdmin = `
  EXISTS (
    SELECT 1 FROM hq_perfil AS outro
    WHERE outro.id <> $1 AND outro.papel = 'Admin' AND outro.ativo
  )
`;

export function perfilDaSessao(registro: RegistroDePerfil): Perfil {
  return perfilSchema.parse({
    nome: registro.nome,
    email: registro.email,
    papel: registro.papel
  });
}

export function perfilComId(registro: RegistroDePerfil): PerfilComId {
  return perfilComIdSchema.parse({
    id: registro.id,
    nome: registro.nome,
    email: registro.email,
    papel: registro.papel,
    ativo: registro.ativo
  });
}

export function listarPerfis() {
  return registros.map(perfilComId);
}

export function buscarPorId(id: string) {
  return registros.find((registro) => registro.id === id);
}

export function buscarPorEmail(email: string) {
  const normalizado = email.trim().toLowerCase();
  return registros.find((registro) => registro.email === normalizado);
}

export async function criarPerfil(identidade: Perfil) {
  const registro: RegistroDePerfil = {
    id: randomUUID(),
    nome: identidade.nome,
    email: identidade.email,
    papel: identidade.papel,
    senha: hashDaSenha('crion-hq'),
    ativo: true,
    versao: 1
  };

  if (deposito) {
    await deposito.query(
      `INSERT INTO hq_perfil (id, nome, email, senha, papel, ativo, versao)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        registro.id,
        registro.nome,
        registro.email,
        registro.senha,
        registro.papel,
        registro.ativo,
        registro.versao
      ]
    );
  }

  registros.push(registro);
  return registro;
}

function outroAdminAtivo(excetoId: string) {
  return registros.some(
    (candidato) =>
      candidato.id !== excetoId && candidato.papel === 'Admin' && candidato.ativo
  );
}

export async function atualizarPerfil(
  id: string,
  identidade: Perfil
): Promise<RegistroDePerfil | MotivoUltimoAdmin | undefined> {
  const registro = buscarPorId(id);

  if (!registro) {
    return undefined;
  }

  const deixaDeSerAdminAtivo =
    registro.papel === 'Admin' && registro.ativo && identidade.papel !== 'Admin';

  if (deixaDeSerAdminAtivo && !outroAdminAtivo(id)) {
    return motivoUltimoAdmin;
  }

  const recusa = await gravarPerfil(
    deixaDeSerAdminAtivo
      ? `UPDATE hq_perfil
         SET nome = $2, email = $3, papel = $4
         WHERE id = $1 AND ${guardaDoUltimoAdmin}`
      : `UPDATE hq_perfil
         SET nome = $2, email = $3, papel = $4
         WHERE id = $1`,
    [id, identidade.nome, identidade.email, identidade.papel],
    deixaDeSerAdminAtivo
  );

  if (recusa) {
    return recusa;
  }

  registro.nome = identidade.nome;
  registro.email = identidade.email;
  registro.papel = identidade.papel;
  return registro;
}

export async function definirAtivo(
  id: string,
  ativo: boolean
): Promise<RegistroDePerfil | MotivoUltimoAdmin | undefined> {
  const registro = buscarPorId(id);

  if (!registro) {
    return undefined;
  }

  if (!ativo && registro.papel === 'Admin' && registro.ativo && !outroAdminAtivo(id)) {
    return motivoUltimoAdmin;
  }

  const desativaAdmin = !ativo && registro.papel === 'Admin';
  const recusa = await gravarPerfil(
    desativaAdmin
      ? `UPDATE hq_perfil SET ativo = false WHERE id = $1 AND ${guardaDoUltimoAdmin}`
      : 'UPDATE hq_perfil SET ativo = $2 WHERE id = $1',
    desativaAdmin ? [id] : [id, ativo],
    desativaAdmin
  );

  if (recusa) {
    return recusa;
  }

  registro.ativo = ativo;
  return registro;
}

export async function redefinirSenha(id: string, senha: string) {
  const registro = buscarPorId(id);

  if (!registro) {
    return undefined;
  }

  const hash = hashDaSenha(senha);
  const versao = registro.versao + 1;
  await gravarPerfil(
    'UPDATE hq_perfil SET senha = $2, versao = $3 WHERE id = $1',
    [id, hash, versao],
    false
  );
  registro.senha = hash;
  registro.versao = versao;
  return registro;
}
