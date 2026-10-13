(() => {
 const examples = {
 bagels: [
  'I need breakfast for 12 people tomorrow at 9. Can I get bagels delivered to my office?',
  'The bagel shop offers breakfast catering with assorted bagels, cream cheese and coffee. Delivery is available within its published service area, and catering requests need at least 24 hours’ notice.',
  'What’s the delivery address, and would you like coffee included? I can help prepare a request for 12 people with your name, delivery date and time. The shop will confirm availability and the total before the order is booked.',
  'Next step: prepare a complete catering request.'
 ],
 plumber: [
  'My kitchen faucet keeps dripping. Can someone come out this week, and what do you need from me?',
  'This plumber handles leaking faucets and other residential plumbing repairs. Its website offers appointment requests, so I can help you send the details the team needs to assess the job.',
  'What’s your address, and which days work for you? A photo of the faucet and a short description of the leak would also help. The plumber will confirm the visit, any call-out fee and repair pricing before you agree to the work.',
  'Next step: send an appointment request with the job details.'
 ],
 cleaning: [
  'I’d like my two-bedroom apartment cleaned next Friday. Can you help me get a quote?',
  'This cleaning service offers apartment cleaning, with separate options for routine visits and a deeper clean. I can help prepare a quote request using its service options.',
  'How many bathrooms do you have, what’s your address, and would you like a routine or deep clean? Tell me about any extras, such as cleaning inside the oven. The team will confirm Friday availability and a quote before anything is booked.',
  'Next step: prepare a cleaning quote request.'
 ]
 };
 document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => {
  const example = examples[button.dataset.case];
  if (!example) return;
  document.querySelectorAll('[data-case]').forEach(b => {
   const active = b === button; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active));
  });
  ['question','answer','followup','agent-next'].forEach((id,index) => { document.getElementById(id).textContent = example[index]; });
 }));
})();
