import {
  perfilComIdSchema,
  perfilSchema,
  type Perfil,
  type PerfilComId
} from '@hq-crion/contracts/perfil';
import { randomUUID } from 'node:crypto';

export type RegistroDePerfil = PerfilComId & { senha: string };

const registros: RegistroDePerfil[] = [
  {
    id: 'perfil-ana',
    nome: 'Ana Souza',
    email: 'ana.souza@crion',
    papel: 'Gestão',
    senha: 'crion-hq'
  },
  {
    id: 'perfil-carla',
    nome: 'Carla Mendes',
    email: 'carla.mendes@crion',
    papel: 'Curador',
    senha: 'crion-hq'
  },
  {
    id: 'perfil-bruno',
    nome: 'Bruno Alves',
    email: 'bruno.alves@crion',
    papel: 'Admin',
    senha: 'crion-hq'
  }
];

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
    papel: registro.papel
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

export function criarPerfil(identidade: Perfil) {
  const registro: RegistroDePerfil = {
    id: randomUUID(),
    nome: identidade.nome,
    email: identidade.email,
    papel: identidade.papel,
    senha: 'crion-hq'
  };
  registros.push(registro);
  return registro;
}

export function atualizarPerfil(id: string, identidade: Perfil) {
  const registro = buscarPorId(id);

  if (!registro) {
    return undefined;
  }

  registro.nome = identidade.nome;
  registro.email = identidade.email;
  registro.papel = identidade.papel;
  return registro;
}
