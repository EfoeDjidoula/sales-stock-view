import { describe, it, expect } from 'vitest';
import { changePermissionChoices } from './permissionChoices';

const catalog = [
  { id: 'read', code: 'supplies.view' },
  { id: 'write', code: 'supplies.create' },
  { id: 'validate', code: 'supplies.validate' },
  { id: 'be', code: 'lifting_orders.view', prerequisites: ['supplies.view'] },
  { id: 'create', code: 'lifting_orders.create', prerequisites: ['supplies.create', 'supplies.validate'] },
  { id: 'sign', code: 'lifting_orders.sign_logistics', prerequisites: ['supplies.validate'] },
];
describe('choix indépendants par profil', () => {
  it('cocher le visa logistique ajoute le prérequis sans autoriser la création du BE', () => {
    expect([...changePermissionChoices(catalog, new Set(), ['sign'], true)].sort()).toEqual(['sign', 'validate']);
  });
  it('décocher une action conserve les autres droits du profil', () => {
    expect([...changePermissionChoices(catalog, new Set(['validate', 'sign', 'create']), ['sign'], false)].sort()).toEqual(['create', 'validate']);
  });
  it('retirer un droit commun retire ses actions dépendantes', () => {
    expect([...changePermissionChoices(catalog, new Set(['validate', 'sign', 'create']), ['validate'], false)]).toEqual([]);
  });
  it('conserve une action si un autre prérequis autorisé reste coché', () => {
    expect([...changePermissionChoices(catalog, new Set(['write', 'validate', 'create']), ['validate'], false)].sort()).toEqual(['create', 'write']);
  });
});