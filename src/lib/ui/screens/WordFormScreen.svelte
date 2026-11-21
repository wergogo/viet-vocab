<script lang="ts">
  let { initialWord = '', editId }: { initialWord?: string; editId?: string } = $props();
</script>

<h1>{editId ? 'Edit word' : 'Add word'}</h1>
<p>{initialWord}</p>
