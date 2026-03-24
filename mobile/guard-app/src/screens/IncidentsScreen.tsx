import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme';
import { IncidentPayload, SecurityIncident } from '../types/guard';
import { formatDateTime } from '../utils/format';

const initialIncident: IncidentPayload = {
  title: '',
  category: 'Visitor',
  severity: 'Medium',
  location: '',
  description: '',
  attachments: [],
};

const categories: Array<IncidentPayload['category']> = ['Access', 'Visitor', 'Patrol', 'Safety', 'Equipment', 'Emergency', 'Other'];
const severities: Array<IncidentPayload['severity']> = ['Low', 'Medium', 'High', 'Critical'];

export function IncidentsScreen({
  incidents,
  onSubmit,
}: {
  incidents: SecurityIncident[];
  onSubmit: (payload: IncidentPayload) => Promise<void>;
}) {
  const [form, setForm] = useState(initialIncident);
  const [submitting, setSubmitting] = useState(false);

  const activeIncidents = incidents.filter((incident) => incident.status === 'Open' || incident.status === 'InReview');

  const submitForm = async () => {
    setSubmitting(true);
    await onSubmit(form);
    setSubmitting(false);
    setForm(initialIncident);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Report incident</Text>
        <Text style={styles.sectionSubtitle}>
          Capture access issues, patrol gaps, visitor conflicts, and emergency flags for admin review.
        </Text>
        <TextInput
          value={form.title}
          onChangeText={(value) => setForm((current) => ({ ...current, title: value }))}
          placeholder="Incident title"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <TextInput
          value={form.location}
          onChangeText={(value) => setForm((current) => ({ ...current, location: value }))}
          placeholder="Location"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <View style={styles.row}>
          <View style={styles.selectorGroup}>
            <Text style={styles.selectorLabel}>Category</Text>
            <View style={styles.chips}>
              {categories.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setForm((current) => ({ ...current, category: option }))}
                  style={[styles.chip, form.category === option ? styles.activeChip : null]}
                >
                  <Text style={[styles.chipText, form.category === option ? styles.activeChipText : null]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.selectorGroup}>
            <Text style={styles.selectorLabel}>Severity</Text>
            <View style={styles.chips}>
              {severities.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setForm((current) => ({ ...current, severity: option }))}
                  style={[styles.chip, form.severity === option ? styles.activeChip : null]}
                >
                  <Text style={[styles.chipText, form.severity === option ? styles.activeChipText : null]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
        <TextInput
          multiline
          value={form.description}
          onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
          placeholder="What happened, who was involved, and what action has already been taken?"
          placeholderTextColor={colors.textMuted}
          style={styles.textArea}
        />
        <Pressable
          onPress={() => void submitForm()}
          disabled={submitting || !form.title || !form.description}
          style={[styles.submitButton, (submitting || !form.title || !form.description) ? styles.disabledButton : null]}
        >
          <Text style={styles.submitButtonText}>Report Incident</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Active incidents</Text>
        <View style={styles.list}>
          {activeIncidents.length ? activeIncidents.map((incident) => (
            <View key={incident.id} style={styles.listCard}>
              <View style={styles.listHeader}>
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle}>{incident.title}</Text>
                  <Text style={styles.listMeta}>{incident.category} / {incident.location || 'Security zone'}</Text>
                </View>
                <Badge
                  label={incident.severity}
                  tone={incident.severity === 'Critical' || incident.severity === 'High' ? 'danger' : 'warning'}
                />
              </View>
              <Text style={styles.description}>{incident.description}</Text>
              <Text style={styles.metaLine}>
                Status: {incident.status} / Assigned: {incident.assigned_guard_name || 'Pending admin review'}
              </Text>
              <Text style={styles.metaLine}>{formatDateTime(incident.occurred_at || incident.created_at)}</Text>
            </View>
          )) : (
            <EmptyState
              title="No active incidents"
              detail="Open and in-review incidents will appear here for the guard team."
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  panel: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
  },
  row: {
    gap: 12,
  },
  selectorGroup: {
    gap: 8,
  },
  selectorLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.surfaceMuted,
  },
  activeChip: {
    backgroundColor: '#e7efff',
    borderColor: '#bfd3ff',
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  activeChipText: {
    color: colors.primaryDeep,
  },
  textArea: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    textAlignVertical: 'top',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
  },
  submitButton: {
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    paddingVertical: 15,
  },
  disabledButton: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  list: {
    gap: 10,
  },
  listCard: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 8,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
  },
  listCopy: {
    flex: 1,
    gap: 3,
  },
  listTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  listMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  description: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  metaLine: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
