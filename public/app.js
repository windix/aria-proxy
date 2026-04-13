const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

createApp({
  setup() {
    // State
    const currentTab = ref('requests');
    const requests = ref([]);
    const settings = ref({
      rpcSecretSet: false,
      rpcSecretMasked: null,
      userAgentOverride: null,
      renameRulesYaml: null
    });
    const refreshTimer = ref(null);
    const expandedHeaders = ref({}); // Maps request IDs to boolean for dropdown state
    const version = ref({ commit: null, tag: null });

    // Computed
    const pendingCount = computed(() => {
      return requests.value.filter(r => r.status === 'pending').length;
    });
    
    const exportedCount = computed(() => {
      return requests.value.filter(r => r.status === 'exported').length;
    });
    
    const totalCount = computed(() => {
      return requests.value.length;
    });

    // Methods
    const fetchRequests = async () => {
      try {
        const res = await fetch('/api/requests');
        requests.value = await res.json();
      } catch (err) {
        console.error('Failed to fetch requests:', err);
      }
    };

    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        settings.value = await res.json();
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };

    const toggleHeaders = (id) => {
      if (expandedHeaders.value[id]) {
        // Vue 3: use object spread to drop the key reactively (delete operator won't trigger updates)
        const { [id]: _, ...rest } = expandedHeaders.value;
        expandedHeaders.value = rest;
      } else {
        expandedHeaders.value = { ...expandedHeaders.value, [id]: true };
      }
    };

    const formatDate = (dateString) => {
      return new Date(dateString + 'Z').toLocaleString();
    };

    const downloadStringAsFile = (text, filename) => {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    };

    const exportPending = async () => {
      try {
        const res = await fetch('/api/requests/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: 'all_pending' })
        });
        const data = await res.json();
        if (data.success) {
          if (data.text.trim().length === 0) {
            alert('No pending requests to export!');
            return;
          }
          downloadStringAsFile(data.text, 'aria2_downloads.txt');
          await fetchRequests();
        }
      } catch (err) {
        console.error(err);
        alert('Failed to export requests.');
      }
    };

    const clearExported = async () => {
      if (!confirm('Are you sure you want to clear all exported requests from the database?')) return;
      try {
        const res = await fetch('/api/requests/clear', { method: 'POST' });
        const data = await res.json();
        if (data.success) await fetchRequests();
      } catch (err) {
        console.error(err);
        alert('Failed to clear exported requests.');
      }
    };

    const deleteAll = async () => {
      if (!confirm('Are you SURE you want to completely delete ALL requests from the database (including pending ones)? This cannot be undone!')) return;
      try {
        const res = await fetch('/api/requests/clear-all', { method: 'POST' });
        const data = await res.json();
        if (data.success) await fetchRequests();
      } catch (err) {
        console.error(err);
        alert('Failed to delete all requests.');
      }
    };

    const deleteRequest = async (id) => {
      if (!confirm('Delete this request?')) return;
      try {
        const res = await fetch('/api/requests/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) await fetchRequests();
      } catch (err) {
        console.error(err);
        alert('Failed to delete request.');
      }
    };

    // Lifecycle
    onMounted(async () => {
      fetchRequests();
      fetchSettings();

      try {
        const res = await fetch('/api/version');
        version.value = await res.json();
      } catch (err) {
        console.error('Failed to fetch version:', err);
      }

      // Auto-refresh every 2.5 seconds, paused automatically if any dropdown is open.
      refreshTimer.value = setInterval(() => {
        if (Object.keys(expandedHeaders.value).length === 0) {
          fetchRequests();
        }
      }, 2500);
    });

    onUnmounted(() => {
      if (refreshTimer.value) {
        clearInterval(refreshTimer.value);
      }
    });

    // Expose all necessary bindings to the template
    return {
      currentTab,
      requests,
      settings,
      expandedHeaders,
      pendingCount,
      exportedCount,
      totalCount,
      version,
      fetchRequests,
      toggleHeaders,
      formatDate,
      exportPending,
      clearExported,
      deleteAll,
      deleteRequest
    };
  }
}).mount('#app');
