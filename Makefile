dev:
	docker build . -t itsjoekent-readme
	docker run -p 5000:5000 \
		--rm -it \
		--env PORT=5000 \
		-v $(PWD)/tmp:/usr/src/app/tmp:cached \
		-v $(PWD)/src:/usr/src/app/src:cached \
		itsjoekent-readme npm run dev