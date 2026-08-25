import { motion } from "framer-motion";

export const Greeting = () => (
  <div className="flex flex-col items-center px-4" key="overview">
    <motion.h1
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[20ch] text-center font-sora text-[28px] font-bold tracking-tight text-balance text-foreground md:text-[32px]"
      initial={{ opacity: 0, y: 6 }}
      transition={{ delay: 0, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      What can I help with?
    </motion.h1>
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 text-center text-sm text-muted-foreground/80"
      initial={{ opacity: 0, y: 6 }}
      transition={{ delay: 0.05, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      Ask a question, write code, or explore ideas.
    </motion.div>
  </div>
);
