'use strict';

/**
 * applicationTemplates.js
 * Vorgefertigte Bewerbungsformular-Vorlagen.
 * Beim Übernehmen wird daraus sofort ein fertiges Formular erzeugt (Admin kann danach anpassen).
 */

const TEMPLATES = [
  {
    templateId: 'supporter',
    label: 'Supporter-Bewerbung',
    emoji: '💚',
    description: 'Standard-Vorlage für Supporter-Bewerbungen.',
    targetTestRoleKey: 'test_supporter',
    questions: [
      { label: 'Wie alt bist du?', style: 'short', required: true },
      { label: 'Seit wann bist du auf dem Server aktiv?', style: 'short', required: true },
      { label: 'Warum möchtest du Supporter werden?', style: 'paragraph', required: true },
      { label: 'Wie viel Zeit kannst du wöchentlich investieren?', style: 'short', required: true },
      { label: 'Hast du bereits Erfahrung im Support/Moderation?', style: 'paragraph', required: false },
    ],
  },
  {
    templateId: 'moderator',
    label: 'Moderator-Bewerbung',
    emoji: '🛡️',
    description: 'Standard-Vorlage für Moderator-Bewerbungen.',
    targetTestRoleKey: 'test_moderator',
    questions: [
      { label: 'Wie alt bist du?', style: 'short', required: true },
      { label: 'Seit wann bist du auf dem Server aktiv?', style: 'short', required: true },
      { label: 'Hast du bereits Moderations-Erfahrung? Wenn ja, wo?', style: 'paragraph', required: true },
      { label: 'Wie würdest du mit einem Streitfall zwischen zwei Mitgliedern umgehen?', style: 'paragraph', required: true },
      { label: 'Wie viel Zeit kannst du wöchentlich investieren?', style: 'short', required: true },
    ],
  },
  {
    templateId: 'admin',
    label: 'Admin-Bewerbung',
    emoji: '🔴',
    description: 'Standard-Vorlage für Admin-Bewerbungen.',
    targetTestRoleKey: 'test_admin',
    questions: [
      { label: 'Wie alt bist du?', style: 'short', required: true },
      { label: 'Seit wann bist du auf dem Server aktiv?', style: 'short', required: true },
      { label: 'Welche Erfahrung hast du in einer Leitungsposition?', style: 'paragraph', required: true },
      { label: 'Wie gehst du mit Konflikten im Team um?', style: 'paragraph', required: true },
      { label: 'Warum bist du für diese Rolle geeignet?', style: 'paragraph', required: true },
    ],
  },
  {
    templateId: 'team-allgemein',
    label: 'Team-Bewerbung (allgemein)',
    emoji: '📋',
    description: 'Allgemeine Vorlage für Team-Bewerbungen ohne festgelegte Position.',
    targetTestRoleKey: null,
    questions: [
      { label: 'Wie alt bist du?', style: 'short', required: true },
      { label: 'Seit wann bist du auf dem Server aktiv?', style: 'short', required: true },
      { label: 'Für welchen Bereich möchtest du dich bewerben?', style: 'short', required: true },
      { label: 'Warum möchtest du Teil des Teams werden?', style: 'paragraph', required: true },
      { label: 'Was zeichnet dich aus?', style: 'paragraph', required: false },
    ],
  },
];

function getTemplate(templateId) {
  return TEMPLATES.find(t => t.templateId === templateId);
}

module.exports = { TEMPLATES, getTemplate };