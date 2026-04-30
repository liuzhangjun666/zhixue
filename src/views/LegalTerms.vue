<script setup>
const updatedAt = '2026-04-30'
</script>

<template>
  <div class="legal-page">
    <h1>用户协议</h1>
    <p class="meta">更新日期：{{ updatedAt }}</p>

    <section>
      <h2>1. 服务说明</h2>
      <p>本平台提供家长与教师的信息匹配和在线沟通功能。你应基于真实、合法、有效的信息使用服务。</p>
    </section>

    <section>
      <h2>2. 账号使用规范</h2>
      <p>账号仅限本人使用，不得转让、出租、出借。你应妥善保管账号和验证码，对账号下操作负责。</p>
    </section>

    <section>
      <h2>3. 信息发布规则</h2>
      <p>不得发布违法违规、侵权、骚扰、欺诈等内容。平台有权对违规内容进行拦截、限制或处置。</p>
    </section>

    <section>
      <h2>4. 责任与限制</h2>
      <p>你应保证提交资料和沟通内容真实合法。因你违规使用服务导致的风险和损失由你自行承担。</p>
    </section>

    <section>
      <h2>5. 协议变更</h2>
      <p>协议条款更新后将通过页面公示。你继续使用服务即视为接受更新后的协议。</p>
    </section>
  </div>
</template>

<style scoped>
.legal-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 16px 96px;
  color: #1f2937;
  line-height: 1.75;
}

.meta {
  color: #6b7280;
  margin-bottom: 12px;
}

section + section {
  margin-top: 16px;
}

h1 {
  margin-bottom: 10px;
}

h2 {
  margin-bottom: 6px;
  font-size: 18px;
}
</style>
