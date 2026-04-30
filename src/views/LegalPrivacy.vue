<script setup>
const updatedAt = '2026-04-30'
</script>

<template>
  <div class="legal-page">
    <h1>隐私政策</h1>
    <p class="meta">更新日期：{{ updatedAt }}</p>

    <section>
      <h2>1. 收集的信息</h2>
      <p>我们会收集注册与服务所必需的信息，包括手机号、账号信息、匹配资料、沟通记录与设备访问日志。</p>
    </section>

    <section>
      <h2>2. 使用目的</h2>
      <p>用于账号注册登录、身份核验、消息通信、匹配服务、风控审计与服务改进。</p>
    </section>

    <section>
      <h2>3. 信息留存</h2>
      <p>通信内容与必要运行日志按平台规则和适用法律要求保留，不低于监管最低期限。</p>
    </section>

    <section>
      <h2>4. 信息共享</h2>
      <p>除法律法规要求或你明确授权外，不向无关第三方提供个人信息。</p>
    </section>

    <section>
      <h2>5. 你的权利</h2>
      <p>你可以在账号设置中发起资料更正、账号注销等请求。对于依法必须留存的信息，我们将在法定期限后处理。</p>
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
